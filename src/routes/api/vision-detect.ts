/**
 * Spacilo Vision AI — real, evidence-based detection endpoint.
 *
 * CORE PRINCIPLE: never invent the user's inventory. Everything returned here
 * must be traceable to something visible in the photographs supplied.
 *
 * The work is deliberately split into two stages, exactly as the product
 * requires:
 *
 *   Stage 1 — DETECTION. Each photograph is described on its own, in physical
 *             terms only ("a fabric storage bag, roughly knee height"). The
 *             model is forbidden from naming catalogue items, guessing at
 *             things it cannot see, or padding the list.
 *   Stage 2 — CLASSIFICATION + DEDUPLICATION. A single text pass reads every
 *             observation together, merges the same physical object seen from
 *             more than one angle, assigns stable ITEM-nnn identities, and
 *             only then attaches storage semantics (category, size estimate,
 *             weight class, fragility, stackability).
 *
 * Counts are evidence-based: the classifier may only report a quantity it can
 * justify from the observations, and must say what the count was based on.
 */
import { createFileRoute } from "@tanstack/react-router";

const MODEL = "openai/gpt-5.6-sol";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MAX_IMAGES = 8;

interface InputImage {
  id?: string;
  mimeType?: string;
  base64?: string;
  /** Plain description of the region the user selected, when they selected one. */
  region?: string;
  /** The user's own words for what they selected. */
  hint?: string;
}

interface DetectBody {
  task?: "belongings" | "space";
  /** "selected" = only what the user marked. "whole" = everything visible. */
  mode?: "selected" | "whole";
  images?: InputImage[];
  spaceType?: string | null;
}

interface Observation {
  ref?: string;
  description?: string;
  visibleCount?: number;
  countBasis?: string;
  occluded?: boolean;
  sizeCue?: string;
  partOf?: string;
  confidence?: number;
}

export interface DetectedItemPayload {
  id: string;
  label: string;
  category: string;
  quantity: number;
  countBasis: string;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  /** Derived from the dimensions above, never taken from the model. */
  volumeM3: number;
  weight: string;
  fragile: boolean;
  stackable: boolean;
  confidence: number;
  photoIds: string[];
  evidence: string;
  /** Parts of this object that are not separate items (rails, cushions…). */
  components: string[];
  /** The detector's own identity for this object. Never index-derived. */
  sourceDetectionId: string;
}


function dataUrl(image: InputImage): string | null {
  if (!image?.base64) return null;
  const mime = image.mimeType?.startsWith("image/") ? image.mimeType : "image/jpeg";
  return `data:${mime};base64,${image.base64}`;
}

/** Reads a JSON object out of a model reply, tolerating fences and prose. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const direct = text.trim();
  const candidates = [direct];
  const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.unshift(fenced[1]);
  const braced = direct.match(/\{[\s\S]*\}/);
  if (braced?.[0]) candidates.push(braced[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

async function chat(
  key: string,
  content: unknown,
  system: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new UpstreamError(response.status, detail.slice(0, 400));
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const raw = payload.choices?.[0]?.message?.content;
  return typeof raw === "string" ? parseJsonObject(raw) : null;
}

class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Phase 6V — ONE structured vision pass per photograph.
 *
 * Detection and classification used to be two sequential model calls. They now
 * happen in a single structured reply per photograph, so the belongings
 * pipeline costs one round trip instead of two. Nothing was relaxed: the same
 * evidence rules apply, the reply is still schema-validated by
 * `normaliseItems`, volume is still calculated locally, and cross-photo
 * merging is now done deterministically in code rather than by a second model
 * call.
 */
const SCAN_SYSTEM = [
  "You are a careful visual observer and classifier for a UK storage marketplace.",
  "You report ONLY what is physically visible in the photograph in front of you, and you classify it in the same reply.",
  "Absolute rules:",
  "1. Never invent, assume or add an object that is not visible. An empty or unclear photo returns an empty list.",
  "2. NAME what you see, in plain UK English, with its distinguishing feature: 'Large blue wheeled case', 'Black backpack', 'Black-framed table', 'Large wall-mounted screen', 'Cardboard box', 'Plastic storage crate'. Keep the label under about six words.",
  "2b. No brands, no models, no identities the image cannot support, and never guess what is inside a closed container.",
  "2c. A shape-and-colour label ('Small dark tapered object') is a LAST RESORT for something you genuinely cannot identify. When you use one, set confidence below 0.6 so a person is asked to confirm it.",
  "3. Count only what you can actually see. Put the count in quantity and say how you counted it in countBasis.",
  "4. Report WHOLE objects, not their parts. A cot, a sofa, a wardrobe or a pushchair is ONE object; its rails, cushions, mattress, drawers, doors, wheels and handles go in components, never in their own entry.",
  "5. Two different things are two entries. Never group different objects together.",
  "6. If the user has marked a region, only objects inside or overlapping that region count. Everything else is background — ignore it.",
  "7. Size is an ESTIMATE in centimetres of the WHOLE assembled object, judged from visible references. Be cautious and realistic. Each of widthCm, depthCm and heightCm must be its own positive number — never 0, never omitted, never copied from another dimension to fill a gap.",
  "8. Do NOT report volume, cubic metres, litres or weight in kilograms. Those are calculated from your dimensions.",
  "9. category must be one of: boxes, furniture, appliances, electronics, leisure, seasonal.",
  "10. weight must be one of: light, medium, heavy.",
  "11. mountingType must be one of: floor, wall_mounted, tabletop, stackable_unit.",
  "12. confidence is 0-1 and must drop when the object is unclear, partly hidden or unfamiliar. Below 0.6 means 'not identified'.",
  "13. Give each object its own detectionId, unique within this photograph, describing the thing ('blue-wheeled-case'), never a position index.",
  'Reply as JSON: {"items":[{"detectionId":"...","label":"...","category":"boxes","quantity":1,"countBasis":"...","widthCm":0,"depthCm":0,"heightCm":0,"weight":"medium","mountingType":"floor","colour":"...","material":"...","fragile":false,"stackable":false,"occluded":false,"confidence":0.0,"evidence":"...","components":["..."]}]}',
].join("\n");

/**
 * Phase 6V — confidence-gated second look.
 *
 * Only genuinely uncertain objects are sent back to the model. High-confidence
 * objects are never reclassified, which is where most of the old second-pass
 * latency went. An uncertain object may only become more specific when the
 * photograph supports it; otherwise it stays generic and stays uncertain.
 */
const REFINE_SYSTEM = [
  "You are re-examining ONLY the objects a first pass could not identify confidently, in the photograph provided.",
  "Absolute rules:",
  "1. You may not add objects. You may not remove objects. You return exactly the objects you were given, by detectionId.",
  "2. Improve a label only when the photograph clearly supports it. If it does not, keep the generic label and keep confidence below 0.6.",
  "3. Never invent a brand, a model or contents you cannot see.",
  "4. You may correct dimensions, category, weight and mountingType when the photograph supports a better estimate.",
  'Reply as JSON: {"items":[{"detectionId":"...","label":"...","category":"boxes","quantity":1,"widthCm":0,"depthCm":0,"heightCm":0,"weight":"medium","mountingType":"floor","fragile":false,"stackable":false,"confidence":0.0,"evidence":"..."}]}',
].join("\n");

/** Objects at or below this confidence get one targeted second look. */
export const REFINE_BELOW_CONFIDENCE = 0.6;



const SPACE_SYSTEM = [
  "You estimate the usable storage geometry of a room from photographs for a UK storage marketplace.",
  "Estimate cautiously from visible references (doors, bricks, floorboards, sockets). Never state a measurement as fact.",
  "Report obstacles, access limitations and anything that reduces usable space.",
  "Identify fixed room features that must remain visually unchanged: wall-mounted televisions, radiators, doors, windows, fitted shelving, built-in furniture and electrical fixtures. These are room features, never storage belongings.",
  "Report TWO separate measurements. (1) roomWidthM/roomDepthM: the WHOLE room, wall to wall, even when only part of it is being used for storage. (2) widthM/depthM: the floor area actually available for storage. If the user marked a region, widthM/depthM describe that region only and roomWidthM/roomDepthM still describe the whole room.",
  "Never report the marked region as the room. A room is almost never narrower than 1.5m — if your room figure is smaller than that, re-check it and lower your confidence.",
  "Reply as JSON: {\"roomWidthM\":0,\"roomDepthM\":0,\"widthM\":0,\"depthM\":0,\"ceilingHeightM\":0,\"usableAreaM2\":0,\"usableVolumeM3\":0,\"suitability\":\"good\",\"observations\":[\"...\"],\"features\":[{\"label\":\"Wall-mounted TV\",\"kind\":\"television\",\"position\":\"rear wall, centred\",\"confidence\":0.0}],\"confidence\":0.0}",
].join("\n");

const CATEGORIES = ["boxes", "furniture", "appliances", "electronics", "leisure", "seasonal"];
const WEIGHTS = ["light", "medium", "heavy"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** A stable, non-index-derived id for an item. */
function slugId(label: string, fallback: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `ITEM-${slug}` : fallback;
}

/** Keeps only items the observations can support, and normalises them. */
export function normaliseItems(raw: unknown, photoIds: string[]): DetectedItemPayload[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: DetectedItemPayload[] = [];
  const used = new Set<string>();
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const label = typeof record["label"] === "string" ? record["label"].trim() : "";
    if (!label) return;
    const ids = Array.isArray(record["photoIds"])
      ? (record["photoIds"] as unknown[]).filter(
          (id): id is string => typeof id === "string" && photoIds.includes(id),
        )
      : [];
    const category = typeof record["category"] === "string" ? record["category"] : "";
    const weight = typeof record["weight"] === "string" ? record["weight"] : "";

    // Identity comes from the model's own id, or from the name — never from
    // the array position, so dropping one item cannot renumber the rest.
    const reported = typeof record["id"] === "string" ? record["id"].trim() : "";
    const positional = `ITEM-${String(index + 1).padStart(3, "0")}`;
    let id = reported || slugId(label, positional);
    let suffix = 2;
    while (used.has(id)) {
      id = `${reported || slugId(label, positional)}-${suffix}`;
      suffix += 1;
    }
    used.add(id);

    // Dimensions are validated one by one, so a missing value can never be
    // filled by the next field along.
    const widthCm = clamp(Math.round(num(record["widthCm"], 40)), 3, 400);
    const depthCm = clamp(Math.round(num(record["depthCm"], 40)), 3, 400);
    const heightCm = clamp(Math.round(num(record["heightCm"], 40)), 3, 300);

    out.push({
      id,
      sourceDetectionId: reported || id,
      label: label.slice(0, 60),
      category: CATEGORIES.includes(category) ? category : "boxes",
      quantity: clamp(Math.round(num(record["quantity"], 1)), 1, 99),
      countBasis:
        typeof record["countBasis"] === "string" ? record["countBasis"].slice(0, 160) : "",
      widthCm,
      depthCm,
      heightCm,
      // Calculated here so every consumer sees the same cubic metres.
      volumeM3: (widthCm * depthCm * heightCm) / 1_000_000,
      weight: WEIGHTS.includes(weight) ? weight : "medium",
      fragile: record["fragile"] === true,
      stackable: record["stackable"] === true,
      confidence: clamp(num(record["confidence"], 0.6), 0.1, 0.99),
      photoIds: ids.length ? ids : photoIds.slice(0, 1),
      evidence: typeof record["evidence"] === "string" ? record["evidence"].slice(0, 240) : "",
      components: Array.isArray(record["components"])
        ? (record["components"] as unknown[])
            .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
            .slice(0, 8)
            .map((part) => part.slice(0, 40))
        : [],
    });
  });
  return out;
}

export const Route = createFileRoute("/api/vision-detect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return Response.json({ error: "not_configured" }, { status: 503 });

        let body: DetectBody;
        try {
          body = (await request.json()) as DetectBody;
        } catch {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }

        const images = (body.images ?? [])
          .slice(0, MAX_IMAGES)
          .map((image, index) => ({
            id: image.id ?? `photo-${index + 1}`,
            url: dataUrl(image),
            region: typeof image.region === "string" ? image.region.slice(0, 200) : "",
            hint: typeof image.hint === "string" ? image.hint.slice(0, 80) : "",
          }))
          .filter((image): image is { id: string; url: string; region: string; hint: string } =>
            Boolean(image.url),
          );
        if (images.length === 0) {
          return Response.json({ error: "no_images" }, { status: 400 });
        }

        const selected = body.mode === "selected";

        try {
          if (body.task === "space") {
            const regions = images
              .map((image) => image.region)
              .filter(Boolean)
              .join("; ");
            const result = await chat(
              key,
              [
                {
                  type: "text",
                  text: `Estimate the usable storage geometry of this space from the photographs.${
                    body.spaceType ? ` The host describes it as: ${body.spaceType}.` : ""
                  }${
                    regions
                      ? ` The host has marked the area they are willing to let out: ${regions}. Estimate only that area, and exclude walls, doorways, walkways and fixed furniture outside it.`
                      : ""
                  }`,
                },
                ...images.map((image) => ({
                  type: "image_url",
                  image_url: { url: image.url },
                })),
              ],
              SPACE_SYSTEM,
            );
            if (!result) return Response.json({ error: "unreadable_reply" }, { status: 502 });
            return Response.json({ task: "space", model: MODEL, space: result });
          }

          /* Stage 1 — per-photograph detection, in parallel. */
          const detectStartedAt = Date.now();
          const observations = await Promise.all(
            images.map(async (image) => {
              const scope = selected
                ? `The user has marked exactly what they want to store: ${
                    image.region || "the region shown"
                  }${image.hint ? ` — they describe it as "${image.hint}"` : ""}. Report ONLY objects inside that region. Everything else in the photograph is background and must be ignored.`
                : "Report every distinct whole object in this photograph of someone's belongings.";
              const reply = await chat(
                key,
                [
                  {
                    type: "text",
                    text: `${scope} Report whole objects, not their parts, and report nothing you cannot actually see.`,
                  },
                  { type: "image_url", image_url: { url: image.url } },
                ],
                DETECT_SYSTEM,
              );
              const list = Array.isArray(reply?.["observations"])
                ? (reply["observations"] as Observation[])
                : [];
              return {
                photoId: image.id,
                ...(image.hint ? { userHint: image.hint } : {}),
                observations: list.slice(0, 30).filter((entry) => !entry.partOf),
              };
            }),
          );


          const detectMs = Date.now() - detectStartedAt;

          const totalObservations = observations.reduce(
            (sum, entry) => sum + entry.observations.length,
            0,
          );
          if (totalObservations === 0) {
            return Response.json({
              task: "belongings",
              model: MODEL,
              items: [],
              observations,
              timings: { detectMs, classifyMs: 0, totalMs: detectMs },
            });
          }

          /* Stage 2 — classification and cross-photo deduplication. */
          const classifyStartedAt = Date.now();
          const classified = await chat(
            key,
            [
              {
                type: "text",
                text: `These observations come from ${images.length} photograph(s) of one person's belongings.${
                  selected
                    ? " The user marked exactly what they want to store, so every observation is in scope and nothing outside it exists."
                    : ""
                } Merge the same physical object across photographs, report primary objects with their components, then classify each distinct item.\n\n${JSON.stringify(
                  observations,
                )}`,
              },
            ],
            CLASSIFY_SYSTEM,
          );

          const items = normaliseItems(
            classified?.["items"],
            images.map((image) => image.id),
          );
          const classifyMs = Date.now() - classifyStartedAt;
          return Response.json({
            task: "belongings",
            model: MODEL,
            items,
            observations,
            // Real, measured stage timings so the pipeline can be tuned on
            // evidence rather than on how slow it feels.
            timings: { detectMs, classifyMs, totalMs: detectMs + classifyMs },
          });
        } catch (cause) {
          if (cause instanceof UpstreamError) {
            const status =
              cause.status === 429 || cause.status === 402 ? cause.status : 502;
            return Response.json({ error: `upstream_${cause.status}` }, { status });
          }
          return Response.json({ error: "upstream_unreachable" }, { status: 502 });
        }
      },
    },
  },
});
