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
  weight: string;
  fragile: boolean;
  stackable: boolean;
  confidence: number;
  photoIds: string[];
  evidence: string;
  /** Parts of this object that are not separate items (rails, cushions…). */
  components: string[];
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

const DETECT_SYSTEM = [
  "You are a careful visual observer for a storage marketplace.",
  "You report ONLY what is physically visible in the photograph in front of you.",
  "Absolute rules:",
  "1. Never invent, assume or add an object that is not visible. An empty or unclear photo returns an empty list.",
  "2. Describe objects physically (shape, material, colour, approximate size against nearby references). Do not use catalogue names and do not guess contents.",
  "3. Count only what you can actually see. If several identical things are visible, say how many and how you counted them. If you cannot count them, say so and give the number you can see.",
  "4. Report WHOLE objects, not their parts. A cot, a sofa, a wardrobe or a pushchair is ONE object. Its rails, cushions, mattress, drawers, doors, wheels and handles are parts of it — put them in partOf, never in their own entry.",
  "5. Do not group different objects together either. Two different things are two entries.",
  "6. If the user has marked a region, only objects inside or overlapping that region count. Anything in the surrounding room is background — do not report it.",
  "7. Say when something is partly hidden.",
  "Reply as JSON: {\"observations\":[{\"ref\":\"A\",\"description\":\"...\",\"visibleCount\":1,\"countBasis\":\"...\",\"occluded\":false,\"sizeCue\":\"...\",\"partOf\":\"\",\"confidence\":0.0}]}",
].join("\n");

const CLASSIFY_SYSTEM = [
  "You classify already-observed physical objects for a UK storage marketplace.",
  "You are given raw per-photograph observations. You may not add anything that is not in them.",
  "Absolute rules:",
  "1. Never introduce an object that no observation mentions. Never drop one either, unless it is the same physical object already listed.",
  "2. The same physical object seen in more than one photograph is ONE item. Merge it and list every photo id it appeared in. Do not add the counts together when it is clearly the same object.",
  "3. Report the PRIMARY object, not its components. If observations describe a cot with rails and a mattress, that is one item 'Cot' with components ['rails','mattress'] — never three items. Only list something separately when it can be stored on its own.",
  "4. Quantity must be justified by the observations. State the basis in countBasis.",
  "5. Give each item a plain, specific UK label describing what it actually is (for example 'Fabric storage bag', 'Three-drawer plastic unit'). Never label something you were not told about.",
  "6. Size is an ESTIMATE in centimetres of the WHOLE assembled object, from the described size cues. Be cautious and realistic.",
  "7. category must be one of: boxes, furniture, appliances, electronics, leisure, seasonal.",
  "8. weight must be one of: light, medium, heavy.",
  "9. confidence is 0-1 and must drop when the observation was uncertain or occluded.",
  "Reply as JSON: {\"items\":[{\"id\":\"ITEM-001\",\"label\":\"...\",\"category\":\"boxes\",\"quantity\":1,\"countBasis\":\"...\",\"widthCm\":0,\"depthCm\":0,\"heightCm\":0,\"weight\":\"medium\",\"fragile\":false,\"stackable\":false,\"confidence\":0.0,\"photoIds\":[\"...\"],\"evidence\":\"...\",\"components\":[\"...\"]}]}",
].join("\n");


const SPACE_SYSTEM = [
  "You estimate the usable storage geometry of a room from photographs for a UK storage marketplace.",
  "Estimate cautiously from visible references (doors, bricks, floorboards, sockets). Never state a measurement as fact.",
  "Report obstacles, access limitations and anything that reduces usable space.",
  "Reply as JSON: {\"widthM\":0,\"depthM\":0,\"ceilingHeightM\":0,\"usableAreaM2\":0,\"usableVolumeM3\":0,\"suitability\":\"good\",\"observations\":[\"...\"],\"confidence\":0.0}",
].join("\n");

const CATEGORIES = ["boxes", "furniture", "appliances", "electronics", "leisure", "seasonal"];
const WEIGHTS = ["light", "medium", "heavy"];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keeps only items the observations can support, and normalises them. */
export function normaliseItems(raw: unknown, photoIds: string[]): DetectedItemPayload[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: DetectedItemPayload[] = [];
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
    out.push({
      id: `ITEM-${String(index + 1).padStart(3, "0")}`,
      label: label.slice(0, 60),
      category: CATEGORIES.includes(category) ? category : "boxes",
      quantity: clamp(Math.round(num(record["quantity"], 1)), 1, 99),
      countBasis:
        typeof record["countBasis"] === "string" ? record["countBasis"].slice(0, 160) : "",
      widthCm: clamp(Math.round(num(record["widthCm"], 40)), 3, 400),
      depthCm: clamp(Math.round(num(record["depthCm"], 40)), 3, 400),
      heightCm: clamp(Math.round(num(record["heightCm"], 40)), 3, 300),
      weight: WEIGHTS.includes(weight) ? weight : "medium",
      fragile: record["fragile"] === true,
      stackable: record["stackable"] === true,
      confidence: clamp(num(record["confidence"], 0.6), 0.1, 0.99),
      photoIds: ids.length ? ids : photoIds.slice(0, 1),
      evidence: typeof record["evidence"] === "string" ? record["evidence"].slice(0, 240) : "",
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
          .map((image, index) => ({ id: image.id ?? `photo-${index + 1}`, url: dataUrl(image) }))
          .filter((image): image is { id: string; url: string } => Boolean(image.url));
        if (images.length === 0) {
          return Response.json({ error: "no_images" }, { status: 400 });
        }

        try {
          if (body.task === "space") {
            const result = await chat(
              key,
              [
                {
                  type: "text",
                  text: `Estimate the usable storage geometry of this space from the photographs.${
                    body.spaceType ? ` The host describes it as: ${body.spaceType}.` : ""
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
          const observations = await Promise.all(
            images.map(async (image) => {
              const reply = await chat(
                key,
                [
                  {
                    type: "text",
                    text: "List every distinct physical object you can actually see in this photograph of someone's belongings. Report nothing you cannot see.",
                  },
                  { type: "image_url", image_url: { url: image.url } },
                ],
                DETECT_SYSTEM,
              );
              const list = Array.isArray(reply?.["observations"])
                ? (reply["observations"] as Observation[])
                : [];
              return { photoId: image.id, observations: list.slice(0, 30) };
            }),
          );

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
            });
          }

          /* Stage 2 — classification and cross-photo deduplication. */
          const classified = await chat(
            key,
            [
              {
                type: "text",
                text: `These observations come from ${images.length} photograph(s) of one person's belongings. Merge the same physical object across photographs, then classify each distinct item.\n\n${JSON.stringify(
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
          return Response.json({ task: "belongings", model: MODEL, items, observations });
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
