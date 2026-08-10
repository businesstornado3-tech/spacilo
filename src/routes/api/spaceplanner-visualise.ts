/**
 * Spacilo AI SpacePlanner™ — visualisation endpoint (Lovable AI Gateway).
 *
 * PROVIDER: Google's image model through the Lovable AI Gateway, using the
 * platform's own `LOVABLE_API_KEY`. No separately funded vendor account is
 * required for SpacePlanner visualisation.
 *
 * The deterministic physical planner remains the sole authority for the
 * arrangement. This route receives an already-final PlacementManifest and asks
 * the image model to draw exactly that manifest into the user's own space
 * photograph. The returned image is then verified object-by-object against the
 * manifest so the UI can say honestly whether the render is faithful,
 * incomplete or unverifiable. A render failure never destroys the plan: the
 * client still holds the manifest and shows the top-down diagram.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  categoriseVerification,
  normaliseLabel,
  type CategorisedVerification,
  type ExpectedSupport,
  type VerifierReply,
  type WhitelistEntry,
} from "@/lib/spaceplanner/photo/verification";



/** Image model used to draw the manifest. Renderer only, never a planner. */
const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image";
/** Vision model used only to check the render. Not a renderer. */
const DEFAULT_VERIFY_MODEL = "google/gemini-3.6-flash";
const PROVIDER = "lovable-ai-gateway";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MAX_ITEM_PHOTOS = 3;
/** The model accepts long prompts; this keeps the manifest whole but bounded. */
const MAX_PROMPT_CHARS = 24_000;

/**
 * Phase 6AD — render and verification get SEPARATE deadlines.
 *
 * They used to share one client-side ceiling. A perfectly good 30s render
 * followed by a 16s check blew a 45s budget, and the client threw away an
 * image the gateway had already been paid to produce. Each stage is now
 * bounded on its own, and a slow CHECK can only cost the verdict, never the
 * render.
 */
const RENDER_DEADLINE_MS = 35_000;
const VERIFY_DEADLINE_MS = 10_000;

/** Aborts a stage without taking the whole request down with it. */
function deadline(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

function imageModel(): string {
  return process.env["SPACEPLANNER_IMAGE_MODEL"]?.trim() || DEFAULT_IMAGE_MODEL;
}

function verifyModel(): string {
  return process.env["SPACEPLANNER_VERIFY_MODEL"]?.trim() || DEFAULT_VERIFY_MODEL;
}

interface ManifestItem {
  id?: string;
  label?: string;
  quantity?: number;
}

interface VisualiseBody {
  spaceImage?: { mimeType?: string; base64?: string };
  itemImages?: { mimeType?: string; base64?: string }[];
  instruction?: string;
  manifest?: ManifestItem[];
  emphasise?: string[];
  roomFeatures?: { id?: string; label?: string; kind?: string; position?: string }[];
  /** Support relationships the deterministic plan asserted. Verified, not hinted. */
  supports?: { itemId?: string; itemLabel?: string; baseId?: string; baseLabel?: string }[];
  /** Carried through for diagnostics only. Never used to re-plan. */
  planHash?: string;
  inventoryHash?: string;
  /** Varies the retry request without changing the plan. */
  nonce?: number;
}


function dataUrl(image: { mimeType?: string; base64?: string }): string | null {
  if (!image?.base64) return null;
  const mime = image.mimeType && image.mimeType.startsWith("image/") ? image.mimeType : "image/jpeg";
  return `data:${mime};base64,${image.base64}`;
}


/** Pulls the first image out of the gateway image response. */
export function extractImage(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (typeof node === "string") {
      if (node.startsWith("data:image/")) return node;
      if (/^https?:\/\//.test(node) && /\.(png|jpe?g|webp)/i.test(node)) return node;
      return null;
    }
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (typeof record["b64_json"] === "string") {
      return `data:image/png;base64,${record["b64_json"] as string}`;
    }
    for (const value of Object.values(record)) {
      const found = walk(value);
      if (found) return found;
    }
    return null;
  };
  return walk(payload);
}

export interface Coverage {
  expected: number;
  present: number;
  missing: string[];
  /**
   * Objects the verifier saw that are neither a whitelisted belonging nor a
   * room feature. Only these are hallucinations.
   */
  unexpected: string[];
  /**
   * Fixed room features that drifted — a door redrawn slightly differently, a
   * radiator partly hidden. Reported, never fatal: the room owning its own
   * door is not the user owning a belonging they do not have.
   */
  featureNotes: string[];
  /**
   * Support relationships the plan asserted that the render did not show.
   * Positional drift: the image contradicts the plan, so it is not displayed.
   */
  supportIssues: string[];
  complete: boolean;
  /** False only when the renderer invented BELONGINGS. */
  faithful: boolean;
  /** Full per-category breakdown, for diagnostics and support. */
  categories: CategorisedVerification;
}

/** Re-exported for tests and callers that normalise labels themselves. */
export function normaliseReported(label: string): string {
  return normaliseLabel(label);
}

/**
 * Builds the coverage report from a verifier reply, using the two explicit
 * whitelists. This is the single place a report becomes a verdict.
 */
export function coverageOf(
  items: WhitelistEntry[] | string[],
  features: WhitelistEntry[] | string[],
  reply?: VerifierReply | string[],
  allowedLabels: string[] = [],
  expectedSupports: readonly ExpectedSupport[] = [],
): Coverage {
  // Legacy call shape (required, present, unexpected, allowedLabels) is still
  // supported so existing verification suites keep exercising this logic.
  const legacy = typeof (features as unknown[])[0] === "string" || Array.isArray(reply);
  const whitelist: WhitelistEntry[] = legacy
    ? (items as string[]).map((id) => ({ id, label: id }))
    : (items as WhitelistEntry[]);
  const featureList: WhitelistEntry[] = legacy ? [] : (features as WhitelistEntry[]);
  const verifierReply: VerifierReply = legacy
    ? { present: (features as string[]) ?? [], unexpected: (reply as string[]) ?? [] }
    : ((reply as VerifierReply) ?? { present: [], unexpected: [] });
  const categories = categoriseVerification({
    items: whitelist,
    features: featureList,
    reply: verifierReply,
    ...(legacy && allowedLabels.length ? { itemAliases: allowedLabels } : {}),
    ...(!legacy ? { itemAliases: whitelist.map((entry) => entry.label) } : {}),
    ...(expectedSupports.length ? { expectedSupports } : {}),
  });
  const { userInventory, roomFeatures } = categories;
  return {
    expected: userInventory.expected.length,
    present: userInventory.found.length,
    missing: userInventory.missing,
    unexpected: userInventory.unexpected,
    featureNotes: roomFeatures.unexpected,
    supportIssues: categories.supportIssues,
    complete: userInventory.missing.length === 0 && userInventory.expected.length > 0,
    faithful: userInventory.unexpected.length === 0,
    categories,
  };
}


/** Reads the checker's JSON reply. Tolerates fenced or noisy output. */
export function parsePresentLabels(text: string): string[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return null;
  }
}

/**
 * Reads the verifier's reply as {present, unexpected, missingFeatures, objects,
 * supports}. Falls back to the older bare-array form so a terse model reply is
 * still usable.
 */
export function parseCheckReply(text: string): VerifierReply | null {
  const object = text.match(/\{[\s\S]*\}/);
  if (object) {
    try {
      const parsed = JSON.parse(object[0]) as Record<string, unknown>;
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
      const present = strings(parsed["present"]);
      const unexpected = strings(parsed["unexpected"]);
      const missingFeatures = strings(parsed["missingFeatures"]);
      const objects = strings(parsed["objects"]);
      const supports = Array.isArray(parsed["supports"])
        ? (parsed["supports"] as unknown[]).flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const record = entry as Record<string, unknown>;
            const item = typeof record["item"] === "string" ? record["item"] : "";
            const restingOn = typeof record["restingOn"] === "string" ? record["restingOn"] : "";
            return item ? [{ item, restingOn }] : [];
          })
        : [];
      if (present.length || unexpected.length || missingFeatures.length || objects.length) {
        return { present, unexpected, missingFeatures, objects, supports };
      }
    } catch {
      /* fall through to the array form */
    }
  }
  const present = parsePresentLabels(text);
  return present ? { present, unexpected: [] } : null;
}

export type Verdict = "verified" | "incomplete" | "unfaithful" | "unverified";

/**
 * Turns an observation into a verdict. An absent or unreadable coverage report
 * is "unverified" — never silently promoted to "verified".
 *
 * Phase 6T: support drift is a contradiction of the deterministic plan, so a
 * render that puts a supported object on the floor is unfaithful, exactly like
 * an invented object. THE PLAN WINS.
 */
export function verdictFor(coverage: Coverage | null): Verdict {
  if (!coverage) return "unverified";
  if (!coverage.faithful) return "unfaithful";
  if ((coverage.supportIssues?.length ?? 0) > 0) return "unfaithful";
  return coverage.complete ? "verified" : "incomplete";
}


/**
 * Object-level render verification, through the gateway.
 *
 * The verifier is asked for THREE separate lists so the two whitelists never
 * collide: what it can see, what stored object it saw that is on neither
 * whitelist, and which room feature drifted. Best effort: a verifier that
 * cannot answer returns null rather than a false accusation.
 */
async function checkCoverage(
  key: string,
  sourceImage: string,
  image: string,
  required: { id: string; label: string }[],
  roomFeatures: { id: string; label: string }[],
  signal?: AbortSignal,
  expectedSupports: readonly ExpectedSupport[] = [],
): Promise<Coverage | null> {
  if (required.length === 0) return null;
  try {
    const response = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        model: verifyModel(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Compare the SOURCE room photograph (first image) with the GENERATED photograph (second image).",
                  `USER_INVENTORY_WHITELIST — belongings that must appear, one entry per unit: ${required.map((item) => `${item.id}=${item.label}`).join("; ")}.`,
                  `ROOM_FEATURE_WHITELIST — parts of the building that must be preserved and are NEVER belongings: ${roomFeatures.map((feature) => `${feature.id}=${feature.label}`).join("; ") || "every fixed fixture visible in the source photograph (doors, doorways, windows, radiators, sockets, fitted units)"}.`,
                  expectedSupports.length
                    ? `EXPECTED_SUPPORTS — the plan places these objects ON TOP OF another object, never on the floor: ${expectedSupports
                        .map((support) => `${support.itemLabel} on ${support.baseLabel}`)
                        .join("; ")}.`
                    : "",
                  // Phase 6AB — STRICT COMPACT JSON. Every semantic check is
                  // retained; only the prose is gone. Verbose verifier replies
                  // cost 1,157–4,829 output tokens and up to 22 seconds.
                  'Reply with JSON only. No prose, no explanation, no markdown. Schema exactly: {"objects":["2x cardboard box"],"present":["ITEM-1"],"unexpected":["shoes"],"missingFeatures":["FEATURE-1"],"supports":[{"item":"tv","restingOn":"tv stand"}]}.',
                  'Every string must be at most 4 words. Never repeat a description. Omit reasoning entirely.',
                  '"objects": every portable/stored object visible, listed independently of the whitelists and BEFORE consulting them. Include small objects (shoes, bottles, toys, bags, cushions). Quantity-accurate: one entry per unit, or prefix the count ("2x cardboard box").',
                  '"present": USER_INVENTORY_WHITELIST ids clearly visible, duplicate units counted separately.',
                  '"unexpected": ONLY stored objects on NEITHER whitelist. Never a room feature, never a whitelisted item.',
                  '"missingFeatures": ROOM_FEATURE_WHITELIST ids that disappeared, moved, changed or became covered.',
                  '"supports": for each EXPECTED_SUPPORTS entry, what it actually stands on. Use "floor" when on the ground.',
                ]
                  .filter(Boolean)
                  .join(" "),
              },
              { type: "image_url", image_url: { url: sourceImage } },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const reply = parseCheckReply(text);
    if (!reply) return null;
    return coverageOf(required, roomFeatures, reply, [], expectedSupports);

  } catch {

    return null;
  }
}

/**
 * The rendering order. The manifest is restated as an exhaustive whitelist so
 * the model has no room to infer belongings from visual priors.
 */
export function buildRenderPrompt(options: {
  instruction: string;
  manifest: ManifestItem[];
  required: { id: string; label: string }[];
  roomFeatures: { id: string; label: string }[];
  emphasise: string[];
  hasItemPhotos: boolean;
  supports?: readonly ExpectedSupport[];
}): string {
  const { instruction, manifest, required, roomFeatures, emphasise, hasItemPhotos } = options;
  const supports = options.supports ?? [];

  const whitelist = manifest
    .map((entry, index) => {
      const label = typeof entry?.label === "string" ? entry.label.trim() : "";
      if (!label) return "";
      const quantity = typeof entry?.quantity === "number" && entry.quantity > 0 ? entry.quantity : 1;
      const id = typeof entry?.id === "string" && entry.id ? entry.id : `item_${String(index + 1).padStart(2, "0")}`;
      return `${id} = ${quantity} × ${label}`;
    })
    .filter(Boolean)
    .join("\n");

  return [
    "You are a photo-realistic RENDERER, not a planner. THE MANIFEST IS AUTHORITATIVE: the arrangement below is final, draw it exactly and change nothing.",
    "Edit the FIRST image, which is a real photograph of a room or storage space. Keep it as the foundation: identical walls, floor, ceiling, doorway, windows, fixed furniture, camera position, perspective, lighting and colour. Do not redesign or regenerate the room.",
    hasItemPhotos
      ? "The remaining images are photographs of the user's real belongings. Render those exact objects, matching their appearance, materials and colours."
      : "Render the described belongings into the photographed space.",
    instruction.slice(0, 3000),
    whitelist
      ? `ALLOWED OBJECTS — exhaustive per-unit whitelist. Render every ID exactly once:\n${whitelist}`
      : "",
    "Do not add, remove, replace, duplicate, merge, substitute or infer any object. Any object not on the whitelist must not appear. No shoes, chairs, tables, extra boxes, extra bags, plants, tools, bicycles, shelving or decorative items.",
    roomFeatures.length
      ? `FIXED ROOM FEATURES — preserve these exactly where they are in the source photograph and never treat them as inventory: ${roomFeatures.map((feature) => `${feature.id}=${feature.label}`).join("; ")}.`
      : "Preserve every source room feature, especially any television, radiator, door, window, fitted shelf, built-in furnishing and electrical fixture. Never remove, relocate, replace or cover them.",
    emphasise.length
      ? `The previous attempt did not show these items. They must be clearly visible this time: ${emphasise.join("; ")}.`
      : "",
    "ARRANGEMENT RULES, in priority order: (1) draw each item at the exact coordinates given; (2) pack items against walls, shoulder to shoulder, with no gaps between neighbours; (3) never place an item in the middle of the open floor or spread items evenly; (4) keep the stated access corridor completely empty; (5) respect perspective and scale, rest every item on the floor or on the item below with contact shadows; (6) nothing floating, clipped, duplicated or invented.",
    supports.length
      ? `SUPPORT RELATIONSHIPS — these objects are stacked on top of another object and must NOT be drawn on the floor: ${supports
          .map((support) => `${support.itemLabel} rests on top of ${support.baseLabel}`)
          .join("; ")}. Draw each one in contact with its base, with a contact shadow.`
      : "",

    required.length
      ? `The finished photograph must contain exactly ${required.length} stored units from the list — no extra objects of any kind.`
      : "",
    "Return only the edited photograph. No labels, boxes, outlines or text overlays.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_PROMPT_CHARS);
}

export const Route = createFileRoute("/api/spaceplanner-visualise")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          // No silent fallback to another provider: report the misconfiguration.
          return Response.json(
            { error: "not_configured", provider: PROVIDER, detail: "LOVABLE_API_KEY is not set" },
            { status: 503 },
          );
        }

        let body: VisualiseBody;
        try {
          body = (await request.json()) as VisualiseBody;
        } catch {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }

        const spacePhoto = body.spaceImage;
        const space = spacePhoto ? dataUrl(spacePhoto) : null;
        if (!space || !spacePhoto?.base64) {
          return Response.json({ error: "missing_space_photo" }, { status: 400 });
        }
        const itemPhotos = (body.itemImages ?? [])
          .slice(0, MAX_ITEM_PHOTOS)
          .map(dataUrl)
          .filter((url): url is string => Boolean(url));

        const manifest = body.manifest ?? [];
        const required = manifest
          .flatMap((entry, index) => {
            const label = typeof entry?.label === "string" ? entry.label.trim() : "";
            if (!label) return [];
            const id = typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : `ITEM-${index + 1}`;
            return [{ id, label }];
          })
          .slice(0, 20);
        if (required.length === 0) {
          return Response.json({ error: "verified_manifest_required" }, { status: 400 });
        }
        const roomFeatures = (body.roomFeatures ?? []).flatMap((feature, index) => {
          const label = typeof feature?.label === "string" ? feature.label.trim() : "";
          if (!label) return [];
          return [{ id: feature.id?.trim() || `FEATURE-${index + 1}`, label }];
        });
        const emphasise = (body.emphasise ?? [])
          .filter((label): label is string => typeof label === "string")
          .slice(0, 20);
        const supports: ExpectedSupport[] = (body.supports ?? []).flatMap((support) => {
          const itemLabel = typeof support?.itemLabel === "string" ? support.itemLabel.trim() : "";
          const baseLabel = typeof support?.baseLabel === "string" ? support.baseLabel.trim() : "";
          if (!itemLabel || !baseLabel) return [];
          return [
            {
              itemId: support.itemId?.trim() || itemLabel,
              itemLabel,
              baseId: support.baseId?.trim() || baseLabel,
              baseLabel,
            },
          ];
        });

        const model = imageModel();
        const diagnosticId = `vis_${Date.now().toString(36)}`;
        const prompt = buildRenderPrompt({
          instruction: body.instruction ?? "",
          manifest,
          required,
          roomFeatures,
          emphasise,
          hasItemPhotos: itemPhotos.length > 0,
          supports,
        });


        // Image-to-image edit through the gateway: the user's space photograph
        // first, then their belongings as visual references. The source photo
        // is the foundation, not a fresh generation.
        const content: Record<string, unknown>[] = [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: space } },
          ...itemPhotos.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

        const startedRender = Date.now();
        let upstream: Response;
        try {
          upstream = await fetch(`${GATEWAY}/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            ...(deadline(RENDER_DEADLINE_MS) ? { signal: deadline(RENDER_DEADLINE_MS)! } : {}),
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content }],
              modalities: ["image", "text"],
              stream: false,
            }),
          });
        } catch (cause) {
          // A stage that ran out of time is a DIFFERENT failure from a service
          // we could not reach, and the UI says so rather than guessing.
          const timedOut =
            cause instanceof DOMException &&
            (cause.name === "TimeoutError" || cause.name === "AbortError");
          const renderMs = Date.now() - startedRender;
          console.error(
            `[spaceplanner-visualise] ${diagnosticId} provider=${PROVIDER} model=${model} stage=render outcome=${timedOut ? "deadline" : "unreachable"} renderMs=${renderMs}`,
          );
          return Response.json(
            {
              error: timedOut ? "render_timeout" : "upstream_unreachable",
              provider: PROVIDER,
              model,
              diagnosticId,
              renderMs,
            },
            { status: timedOut ? 504 : 502 },
          );
        }

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          console.error(
            `[spaceplanner-visualise] ${diagnosticId} provider=${PROVIDER} model=${model} upstream=${upstream.status} ${detail.slice(0, 400)}`,
          );
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return Response.json(
            { error: `upstream_${upstream.status}`, provider: PROVIDER, model, diagnosticId },
            { status },
          );
        }

        let payload: unknown;
        try {
          payload = await upstream.json();
        } catch {
          return Response.json(
            { error: "bad_upstream_payload", provider: PROVIDER, model, diagnosticId },
            { status: 502 },
          );
        }

        const image = extractImage(payload);
        if (!image) {
          return Response.json(
            { error: "no_image_returned", provider: PROVIDER, model, diagnosticId },
            { status: 502 },
          );
        }
        const renderMs = Date.now() - startedRender;

        // The check is bounded on its own clock. If it runs out of time the
        // image still comes back, marked unverified — the client's fail-closed
        // rule then keeps it hidden. A slow checker costs a verdict, never a
        // paid-for render.
        const startedCheck = Date.now();
        const coverage = await checkCoverage(
          key,
          space,
          image,
          required,
          roomFeatures,
          deadline(VERIFY_DEADLINE_MS),
          supports,
        );
        const verifyMs = Date.now() - startedCheck;
        const verifyTimedOut = coverage === null && verifyMs >= VERIFY_DEADLINE_MS - 250;
        // Verification never withholds the image. The client decides whether a
        // render is presentable; the server reports honestly what it observed
        // and distinguishes "could not verify" from "verified as wrong".
        const verification = verdictFor(coverage);

        console.log(
          `[spaceplanner-visualise] ${diagnosticId} provider=${PROVIDER} model=${model} verifyModel=${verifyModel()} planHash=${body.planHash ?? "-"} inventoryHash=${body.inventoryHash ?? "-"} units=${required.length} verification=${verification} present=${coverage?.present ?? "?"}/${required.length} unexpected=${coverage?.unexpected.length ?? 0} renderMs=${renderMs} verifyMs=${verifyMs} verifyTimedOut=${verifyTimedOut}`,
        );

        return Response.json({
          image,
          provider: PROVIDER,
          model,
          verifyModel: verifyModel(),
          coverage,
          verification,
          diagnosticId,
          planHash: body.planHash ?? null,
          inventoryHash: body.inventoryHash ?? null,
          renderMs,
          verifyMs,
          verifyTimedOut,
          serverTotalMs: Date.now() - startedRender,
        });
      },
    },
  },
});
