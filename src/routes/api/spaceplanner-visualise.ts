/**
 * Spacilo AI SpacePlanner™ — visualisation endpoint.
 *
 * Takes the user's OWN space photograph, photographs of their belongings and
 * the canonical placement manifest, and asks an image model to edit the space
 * photo so those exact belongings appear realistically placed inside it. The
 * space photograph is always the visual foundation: the model is instructed to
 * preserve the room, never to invent a new one.
 *
 * The returned image is then checked against the manifest, so the UI can say
 * honestly how many of the required items are actually represented. If the
 * model returns no image the route fails loudly rather than letting a
 * geometric overlay be presented as an AI visualisation.
 */
import { createFileRoute } from "@tanstack/react-router";

const MODEL = "google/gemini-3-pro-image";
const CHECK_MODEL = "google/gemini-3.6-flash";
const MAX_ITEM_PHOTOS = 3;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

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
}

function dataUrl(image: { mimeType?: string; base64?: string }): string | null {
  if (!image?.base64) return null;
  const mime = image.mimeType && image.mimeType.startsWith("image/") ? image.mimeType : "image/jpeg";
  return `data:${mime};base64,${image.base64}`;
}

/** Pulls the first image out of the gateway's OpenAI-compatible response. */
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
  /** Objects the verifier saw that are not in the verified inventory. */
  unexpected: string[];
  complete: boolean;
  /** False when the renderer invented belongings. */
  faithful: boolean;
}

/** Compares the labels a checker reported against the labels required. */
export function coverageOf(
  required: string[],
  present: string[],
  unexpected: string[] = [],
): Coverage {
  const seen = new Set(present.map((label) => label.trim().toLowerCase()));
  const missing = required.filter((label) => !seen.has(label.trim().toLowerCase()));
  const allowed = new Set(required.map((label) => label.trim().toLowerCase()));
  const invented = unexpected
    .map((label) => label.trim())
    .filter((label) => label.length > 0 && !allowed.has(label.toLowerCase()));
  return {
    expected: required.length,
    present: required.length - missing.length,
    missing,
    unexpected: invented,
    complete: missing.length === 0 && required.length > 0,
    faithful: invented.length === 0,
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
 * Reads the verifier's reply as {present, unexpected}. Falls back to the
 * older bare-array form so a terse model reply is still usable.
 */
export function parseCheckReply(
  text: string,
): { present: string[]; unexpected: string[] } | null {
  const object = text.match(/\{[\s\S]*\}/);
  if (object) {
    try {
      const parsed = JSON.parse(object[0]) as Record<string, unknown>;
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
      const present = strings(parsed["present"]);
      const unexpected = strings(parsed["unexpected"]);
      if (present.length || unexpected.length) return { present, unexpected };
    } catch {
      /* fall through to the array form */
    }
  }
  const present = parsePresentLabels(text);
  return present ? { present, unexpected: [] } : null;
}

/**
 * Render verification. Asks a vision model which required items it can see AND
 * which stored objects it can see that are NOT on the list — an invented
 * object is a critical failure, not a cosmetic one. Best effort: a verifier
 * that cannot answer returns null rather than a false accusation.
 */
async function checkCoverage(
  key: string,
  sourceImage: string,
  image: string,
  required: { id: string; label: string }[],
  roomFeatures: { id: string; label: string }[],
): Promise<Coverage | null> {
  if (required.length === 0) return null;
  try {
    const response = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHECK_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Compare the SOURCE room photograph (first image) with the GENERATED photograph (second image). Required inventory units are: ${required.map((item) => `${item.id}=${item.label}`).join("; ")}. Required fixed room features are: ${roomFeatures.map((feature) => `${feature.id}=${feature.label}`).join("; ") || "all visible source fixtures"}. Reply JSON only as {"present":["ITEM_ID"],"unexpected":["description"]}. Count duplicate units separately. A required unit is present only when clearly visible. Report any generated stored object without a required ID as unexpected. Also report as unexpected any source television, radiator, door, window, fitted shelf, built-in furnishing or electrical fixture that disappeared, moved, changed or became covered.`,
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
    return coverageOf(required.map((item) => item.id), reply.present, reply.unexpected);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/spaceplanner-visualise")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return Response.json({ error: "not_configured" }, { status: 503 });
        }

        let body: VisualiseBody;
        try {
          body = (await request.json()) as VisualiseBody;
        } catch {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }

        const space = body.spaceImage ? dataUrl(body.spaceImage) : null;
        if (!space) {
          return Response.json({ error: "missing_space_photo" }, { status: 400 });
        }
        const items = (body.itemImages ?? [])
          .slice(0, MAX_ITEM_PHOTOS)
          .map(dataUrl)
          .filter((url): url is string => Boolean(url));

        const required = (body.manifest ?? [])
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

        const content: Record<string, unknown>[] = [
          {
            type: "text",
            text: [
              "You are a photo-realistic RENDERER. A physical planning engine has already decided the arrangement. Your only job is to draw it. You must not plan, re-plan, improve, tidy or reinterpret the layout.",
              "Edit the FIRST image, which is a real photograph of a room or storage space.",
              "Keep that photograph as the foundation: same walls, floor, doorway, camera angle, lighting and colour.",
              "Do not generate a new room and do not change the existing contents.",
              items.length
                ? "The following images show the user's real belongings. Place those exact items into the photographed space, matching their appearance, materials and colours."
                : "Place the described belongings into the photographed space.",
              body.instruction?.slice(0, 6000) ?? "",
              required.length
                ? `ALLOWED OBJECTS — this is an exhaustive per-unit whitelist. Render every ID exactly once:\n${(body.manifest ?? [])
                    .map((entry, index) => {
                      const label = typeof entry?.label === "string" ? entry.label.trim() : "";
                      const quantity =
                        typeof entry?.quantity === "number" && entry.quantity > 0 ? entry.quantity : 1;
                      const id = typeof entry?.id === "string" ? entry.id : `item_${String(index + 1).padStart(2, "0")}`;
                      return label ? `${id} = ${quantity} × ${label}` : "";
                    })
                    .filter(Boolean)
                    .join("\n")}`
                : "",
              required.length
                ? "Do not add, remove, replace, duplicate, merge or invent any object. Any object that is not on the whitelist above must not appear. No shoes, chairs, tables, extra boxes, extra bags, plants, tools, bicycles or decorative items."
                : "",
              roomFeatures.length
                ? `FIXED ROOM FEATURES — preserve these exactly where they are in the source image and never treat them as inventory: ${roomFeatures.map((feature) => `${feature.id}=${feature.label}`).join("; ")}.`
                : "Preserve every source room feature, especially any television, radiator, door, window, fitted shelf, built-in furnishing and electrical fixture. Never remove, relocate, replace or cover them.",
              emphasise.length
                ? `The previous attempt did not show these items. They must be clearly visible this time: ${emphasise.join("; ")}.`
                : "",
              "ARRANGEMENT RULES, in priority order: (1) draw each item at the exact coordinates given; (2) pack items against walls, shoulder to shoulder, with no gaps between neighbours; (3) never place an item in the middle of the open floor or spread items evenly across the room; (4) keep the stated access corridor completely empty; (5) respect perspective and scale, rest every item on the floor or on the item below with contact shadows; (6) no floating, clipped, duplicated or invented objects.",
              "THE MANIFEST IS AUTHORITATIVE. Do not move, rotate, resize, duplicate, remove, substitute or reinterpret any object because another position would look better. A position you disagree with is still the position you must draw.",
              "Do not add shelving, racks, cupboards, cabinets, drawers, hooks, pallets, crates or any storage furniture that is not already in the photograph.",
              required.length
                ? `The finished photograph must contain exactly ${required.length} stored units from the list — no extra objects of any kind.`
                : "",
              "Return only the edited photograph. No labels, no boxes, no outlines, no text overlays.",

            ]
              .filter(Boolean)
              .join(" "),
          },
          { type: "image_url", image_url: { url: space } },
          ...items.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

        let upstream: Response;
        try {
          upstream = await fetch(`${GATEWAY}/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              messages: [{ role: "user", content }],
              modalities: ["image", "text"],
              stream: false,
            }),
          });
        } catch {
          return Response.json({ error: "upstream_unreachable" }, { status: 502 });
        }

        if (!upstream.ok) {
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return Response.json({ error: `upstream_${upstream.status}` }, { status });
        }

        let payload: unknown;
        try {
          payload = await upstream.json();
        } catch {
          return Response.json({ error: "bad_upstream_payload" }, { status: 502 });
        }

        const image = extractImage(payload);
        if (!image) {
          return Response.json({ error: "no_image_returned" }, { status: 502 });
        }

        const coverage = await checkCoverage(key, space, image, required, roomFeatures);
        if (!coverage || !coverage.complete || !coverage.faithful) {
          return Response.json({ error: "render_verification_failed", coverage }, { status: 422 });
        }
        return Response.json({ image, model: MODEL, coverage });
      },
    },
  },
});
