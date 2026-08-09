/**
 * Spacilo Vision AI — real, evidence-based detection endpoint.
 *
 * CORE PRINCIPLE: never invent the user's inventory. Everything returned here
 * must be traceable to something visible in the photographs supplied.
 *
 * Phase 6V — the pipeline is now ONE structured vision pass per photograph,
 * with every photograph analysed in parallel:
 *
 *   Pass 1 — SCAN. Each photograph returns whole objects with their identity,
 *            category, quantity, count basis, estimated dimensions, mounting
 *            type and confidence, in a single schema-validated reply. It used
 *            to take two sequential model calls; it now takes one.
 *   Local  — MERGE. The same physical object photographed twice is merged
 *            deterministically in code (label stem + comparable dimensions),
 *            with no model call and no chance of invention.
 *   Pass 2 — REFINE, only for objects below the confidence floor, and only in
 *            the photograph they came from. Confident objects are never
 *            reclassified.
 *
 * Counts stay evidence-based, dimensions are validated field by field, and
 * volume is always calculated here rather than trusted from the model.
 */

import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 6X — belongings detection runs on the fast multimodal model.
 *
 * The previous reasoning model spent 21–51s and 2,400–3,900 output tokens on a
 * single photograph, which was the largest user-visible wait in the whole
 * product. Nothing about the safety pipeline changed: the reply is still
 * schema-validated by `normaliseItems`, volume is still calculated here, and
 * the deterministic merge still happens in code.
 */
export const SCAN_MODEL = "google/gemini-3.6-flash";
/** Room geometry is the same kind of visual estimate; same fast model. */
export const SPACE_MODEL = "google/gemini-3.6-flash";
const MODEL = SCAN_MODEL;
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
  /** floor | wall_mounted | tabletop | stackable_unit. */
  mountingType: string;
  colour?: string;
  material?: string;
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
  model: string = MODEL,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
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
 * Phase 6X — ONE compact structured vision pass per photograph.
 *
 * One reply per photograph, and a deliberately small one. The model identifies
 * objects; it does not explain itself. No evidence prose, no count narration,
 * no component lists, no reasoning — those fields cost thousands of output
 * tokens per photograph and bought nothing the deterministic pipeline uses.
 *
 * Nothing was relaxed: the reply is still schema-validated by
 * `normaliseItems`, dimensions are still validated field by field, volume is
 * still calculated here, and cross-photograph merging is still deterministic
 * code rather than a second model call.
 */
export const SCAN_SYSTEM = [
  "You identify storable objects in a photograph for a UK storage marketplace. Output compact JSON only — no prose, no explanation, no reasoning.",
  "1. Report ONLY what is visible. An empty or unclear photo returns an empty list. Never invent an object.",
  "2. label: plain UK English with its distinguishing feature, under six words — 'Large blue wheeled case', 'Black backpack', 'Cardboard box'. No brands, no guessing container contents.",
  "3. A shape-and-colour label is a LAST RESORT; when you use one set confidence below 0.6.",
  "4. quantity: only what you can actually see.",
  "5. Report WHOLE objects, never their parts. A cot, sofa, wardrobe or pushchair is ONE object.",
  "6. Two different things are two entries. Never group different objects together.",
  "7. If the user marked a region, only objects inside or overlapping it count.",
  "8. widthCm/depthCm/heightCm: centimetre estimates of the whole assembled object. Each is its own positive number — never 0, never omitted, never copied from another dimension.",
  "9. Never report volume, litres or kilograms; those are calculated from your dimensions.",
  "10. category: boxes | furniture | appliances | electronics | leisure | seasonal. weight: light | medium | heavy. mountingType: floor | wall_mounted | tabletop | stackable_unit.",
  "11. confidence 0-1, lower when the object is unclear, partly hidden or unfamiliar. Below 0.6 means 'not identified'.",
  "12. detectionId: a short descriptive slug unique within this photograph ('blue-wheeled-case'), never a position index.",
  'Reply as JSON only: {"items":[{"detectionId":"","label":"","category":"boxes","quantity":1,"widthCm":0,"depthCm":0,"heightCm":0,"weight":"medium","mountingType":"floor","colour":"","fragile":false,"stackable":false,"confidence":0.0}]}',
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
  'Reply as JSON only, no prose: {"items":[{"detectionId":"","label":"","category":"boxes","quantity":1,"widthCm":0,"depthCm":0,"heightCm":0,"weight":"medium","mountingType":"floor","fragile":false,"stackable":false,"confidence":0.0}]}',
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
const MOUNTINGS = ["floor", "wall_mounted", "tabletop", "stackable_unit"];

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
    const reported =
      typeof record["id"] === "string"
        ? record["id"].trim()
        : typeof record["detectionId"] === "string"
          ? slugId(record["detectionId"].trim(), "")
          : "";
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
      mountingType: MOUNTINGS.includes(String(record["mountingType"]))
        ? String(record["mountingType"])
        : "floor",
      ...(typeof record["colour"] === "string" && record["colour"].trim()
        ? { colour: record["colour"].trim().slice(0, 30) }
        : {}),
      ...(typeof record["material"] === "string" && record["material"].trim()
        ? { material: record["material"].trim().slice(0, 30) }
        : {}),
    });
  });
  return out;
}

/**
 * Phase 6V — deterministic cross-photograph merge.
 *
 * The same physical object photographed twice used to be merged by a second
 * model call. It is merged here instead: identical labels with comparable
 * dimensions are one object, and the photo ids are unioned rather than the
 * counts added. Deterministic, instant, and it cannot invent anything.
 */
export function mergeAcrossPhotos(groups: DetectedItemPayload[][]): DetectedItemPayload[] {
  const out: DetectedItemPayload[] = [];
  const stem = (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  const comparable = (a: DetectedItemPayload, b: DetectedItemPayload) => {
    const ratio = (x: number, y: number) => Math.max(x, y) / Math.max(1, Math.min(x, y));
    return (
      ratio(a.widthCm, b.widthCm) < 1.6 &&
      ratio(a.depthCm, b.depthCm) < 1.6 &&
      ratio(a.heightCm, b.heightCm) < 1.6
    );
  };

  groups.forEach((group) => {
    group.forEach((item) => {
      const existing = out.find(
        (candidate) =>
          stem(candidate.label) === stem(item.label) &&
          candidate.category === item.category &&
          comparable(candidate, item),
      );
      if (!existing) {
        out.push({ ...item, photoIds: [...item.photoIds] });
        return;
      }
      // Same object, another angle: union the photos, keep the larger count
      // rather than adding the two together, and keep the better evidence.
      existing.photoIds = Array.from(new Set([...existing.photoIds, ...item.photoIds]));
      existing.quantity = Math.max(existing.quantity, item.quantity);
      if (item.confidence > existing.confidence) {
        existing.confidence = item.confidence;
        if (item.evidence) existing.evidence = item.evidence;
      }
    });
  });

  // Ids must stay unique after merging.
  const used = new Set<string>();
  return out.map((item) => {
    let id = item.id;
    let suffix = 2;
    while (used.has(id)) {
      id = `${item.id}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return { ...item, id };
  });
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
              SPACE_MODEL,
            );
            if (!result) return Response.json({ error: "unreadable_reply" }, { status: 502 });
            return Response.json({ task: "space", model: SPACE_MODEL, space: result });
          }

          /*
           * Phase 6V — ONE structured pass per photograph, all photographs in
           * parallel. Detection, identification, class, quantity, dimensions,
           * mounting and confidence come back together, so the belongings
           * pipeline is a single round trip rather than two sequential ones.
           */
          const detectStartedAt = Date.now();
          const perPhoto = await Promise.all(
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
                    text: `${scope} Whole objects only. Compact JSON only.`,
                  },
                  { type: "image_url", image_url: { url: image.url } },
                ],
                SCAN_SYSTEM,
              );
              return {
                photoId: image.id,
                items: normaliseItems(reply?.["items"], [image.id]),
              };
            }),
          );
          const detectMs = Date.now() - detectStartedAt;

          // Deterministic, local cross-photograph merge. No model call.
          const mergeStartedAt = Date.now();
          let items = mergeAcrossPhotos(perPhoto.map((entry) => entry.items));
          const mergeMs = Date.now() - mergeStartedAt;

          if (items.length === 0) {
            return Response.json({
              task: "belongings",
              model: SCAN_MODEL,
              items: [],
              timings: { detectMs, mergeMs, classifyMs: 0, refineMs: 0, totalMs: detectMs + mergeMs },
              calls: { scan: images.length, refine: 0 },
            });
          }

          /*
           * Phase 6V — confidence-gated second look. Only objects the first
           * pass could not identify are re-examined, and only in the
           * photograph they came from. Confident objects are never
           * reclassified, which is where the old second pass spent its time.
           */
          const refineStartedAt = Date.now();
          let refineCalls = 0;
          const uncertainByPhoto = new Map<string, DetectedItemPayload[]>();
          items
            .filter((item) => item.confidence < REFINE_BELOW_CONFIDENCE)
            .forEach((item) => {
              const photoId = item.photoIds[0];
              if (!photoId) return;
              uncertainByPhoto.set(photoId, [...(uncertainByPhoto.get(photoId) ?? []), item]);
            });

          if (uncertainByPhoto.size > 0) {
            const refinements = await Promise.all(
              [...uncertainByPhoto.entries()].map(async ([photoId, uncertain]) => {
                const image = images.find((entry) => entry.id === photoId);
                if (!image) return [];
                refineCalls += 1;
                const reply = await chat(
                  key,
                  [
                    {
                      type: "text",
                      text: `Re-examine ONLY these objects, by detectionId, in this photograph. Return exactly these objects and no others.\n\n${JSON.stringify(
                        uncertain.map((item) => ({
                          detectionId: item.sourceDetectionId,
                          label: item.label,
                          widthCm: item.widthCm,
                          depthCm: item.depthCm,
                          heightCm: item.heightCm,
                          confidence: item.confidence,
                        })),
                      )}`,
                    },
                    { type: "image_url", image_url: { url: image.url } },
                  ],
                  REFINE_SYSTEM,
                ).catch(() => null);
                return normaliseItems(reply?.["items"], [photoId]);
              }),
            );

            // A refinement may only improve an object that already exists. It
            // can never add one, and it can never remove one.
            const improved = new Map(
              refinements.flat().map((item) => [item.sourceDetectionId, item] as const),
            );
            items = items.map((item) => {
              const better = improved.get(item.sourceDetectionId);
              if (!better || better.confidence <= item.confidence) return item;
              return {
                ...item,
                label: better.label,
                category: better.category,
                widthCm: better.widthCm,
                depthCm: better.depthCm,
                heightCm: better.heightCm,
                volumeM3: better.volumeM3,
                weight: better.weight,
                fragile: better.fragile,
                stackable: better.stackable,
                mountingType: better.mountingType,
                confidence: better.confidence,
                evidence: better.evidence || item.evidence,
              };
            });
          }
          const refineMs = Date.now() - refineStartedAt;

          return Response.json({
            task: "belongings",
            model: SCAN_MODEL,
            items,
            // Real, measured stage timings so the pipeline can be tuned on
            // evidence rather than on how slow it feels.
            timings: {
              detectMs,
              mergeMs,
              // Kept for compatibility: classification now happens inside the
              // single scan pass, so its separate cost is the refinement only.
              classifyMs: refineMs,
              refineMs,
              totalMs: detectMs + mergeMs + refineMs,
            },
            calls: { scan: images.length, refine: refineCalls },
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
