/**
 * SpacePlanner visualisation — client pipeline.
 *
 * Downstream of the confirmed inventory: the placement manifest built from the
 * canonical inventory and the analytical plan is what the image model is asked
 * to satisfy, and what the returned image is checked against. A geometric
 * overlay is never returned from here: if no image comes back, or the image
 * cannot be shown to contain the required items, the caller is told.
 */
import type { PhotoPlanResult } from "./plan";
import {
  formatManifestForModel,
  requiredLabels,
  type CoverageReport,
  type PlacementManifest,
} from "./manifest";
import { hashString } from "@/lib/vision/hash";
import type { DetectedObject } from "@/lib/vision/types";

export type VisualisationStage =
  | "reading"
  | "identifying"
  | "sizing"
  | "space"
  | "fitting"
  | "planning"
  | "rendering"
  | "checking";

export const VISUALISATION_STAGES: { id: VisualisationStage; label: string }[] = [
  { id: "reading", label: "Reading your belongings…" },
  { id: "identifying", label: "Identifying your items…" },
  { id: "sizing", label: "Checking sizes and quantities…" },
  { id: "space", label: "Reading your storage space…" },
  { id: "fitting", label: "Calculating the best fit…" },
  { id: "planning", label: "Planning the arrangement…" },
  { id: "rendering", label: "Creating your visual preview…" },
  { id: "checking", label: "Checking that all your items are included…" },
];

export interface VisualisationImage {
  mimeType: string;
  base64: string;
}

export interface VisualisationRequest {
  spaceImage: VisualisationImage;
  itemImages: VisualisationImage[];
  instruction: string;
  /** Structured manifest the image must satisfy. */
  manifest?: { label: string; quantity: number }[];
  /** Items a previous attempt missed; the retry emphasises these. */
  emphasise?: string[];
}

export interface VisualisationResponse {
  image: string;
  coverage: CoverageReport | null;
}

/**
 * The rendering order sent to the image model.
 *
 * The deterministic physical plan is the single authority. When a manifest
 * exists, the manifest's metric coordinates ARE the instruction — no second,
 * looser description is included alongside it, because two descriptions of the
 * same arrangement is exactly how items end up scattered. Without a manifest
 * (a preview before the inventory is locked) a plain-language fallback is used.
 */
export function buildVisualisationInstruction(
  result: PhotoPlanResult,
  objects: DetectedObject[],
  manifest?: PlacementManifest,
): string {
  const arrangement = result.arrangement;
  const excluded = arrangement.unplaced.length
    ? `Do NOT draw these — the plan could not fit them: ${arrangement.unplaced.map((entry) => entry.label).join(", ")}.`
    : "";
  const dimensions = `The space is roughly ${result.space.width.toFixed(1)}m wide by ${result.space.depth.toFixed(1)}m deep with about ${result.space.height.toFixed(1)}m of height.`;
  const volume = `The placed items occupy roughly ${result.spaceUsedM3.toFixed(1)}m³, leaving about ${result.spaceRemainingM3.toFixed(1)}m³ free.`;

  if (manifest) {
    return [
      "YOU ARE A RENDERER, NOT A PLANNER. The arrangement below has already been calculated by a physical planning engine and validated. Reproduce it exactly. Do not move, add, remove, resize, duplicate or rearrange anything, and do not scatter items across the open floor.",
      dimensions,
      `EVERY item in this manifest must appear in the edited photograph, at the exact coordinates given:\n\n${formatManifestForModel(manifest)}`,
      "Items sharing a wall must sit shoulder to shoulder with no gaps between them. Nothing floats, nothing overlaps, nothing sits in the middle of the floor unless its coordinates say so.",
      excluded,
      volume,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const items = objects
    .slice(0, 8)
    .map((object) => {
      const size = `${Math.round(object.width)}×${Math.round(object.depth)}×${Math.round(object.height)}cm`;
      const quantity = object.quantity > 1 ? `${object.quantity}× ` : "";
      return `${quantity}${object.label} (about ${size})`;
    })
    .join(", ");

  const placements = arrangement.entries
    .slice(0, 12)
    .map((entry) => {
      const count = entry.units > 1 ? `${entry.units}× ` : "";
      const stacked =
        entry.units > 1 ? " stacked vertically" : entry.layer > 0 ? " resting on the item below" : "";
      const turned =
        entry.orientation === "upright"
          ? ", standing upright on its edge"
          : entry.rotationDeg
            ? ", turned 90°"
            : "";
      return `${count}${entry.label} at ${describeSpot(entry.x + entry.w / 2, entry.y + entry.d / 2, result)}${turned}${stacked}`;
    })
    .join("; ");

  return [
    dimensions,
    items ? `Belongings to place: ${items}.` : "",
    placements
      ? `The arrangement has already been calculated. Place each item exactly as specified and do not move, add, remove or rearrange anything: ${placements}.`
      : "",
    arrangement.walkway
      ? "Leave a clear walkway from the opening through the space; no item may stand in it."
      : "",
    excluded,
    volume,
  ]
    .filter(Boolean)
    .join(" ");
}


function describeSpot(x: number, y: number, result: PhotoPlanResult): string {
  const across = x / Math.max(result.space.width, 0.1);
  const into = y / Math.max(result.space.depth, 0.1);
  const side = across < 0.34 ? "the left wall" : across > 0.66 ? "the right wall" : "the centre";
  const depth = into < 0.34 ? "the back of the room" : into > 0.66 ? "the entrance" : "the middle";
  return `${side}, towards ${depth}`;
}


/** Manifest → the compact list the endpoint validates against. */
export function manifestPayload(manifest: PlacementManifest): { label: string; quantity: number }[] {
  return requiredLabels(manifest).map((label) => {
    const entry = manifest.entries.find((candidate) => candidate.label === label)!;
    return { label: entry.label, quantity: entry.quantity };
  });
}

/**
 * Deterministic request signature. Same photos, same inventory, same plan →
 * same key, so a repeated request can reuse the previous image.
 */
export function visualisationSignature(request: VisualisationRequest): string {
  const parts = [
    request.spaceImage.base64.slice(0, 256),
    String(request.spaceImage.base64.length),
    ...request.itemImages.map((image) => `${image.base64.length}:${image.base64.slice(0, 96)}`),
    request.instruction,
    (request.emphasise ?? []).join(","),
  ];
  return `vis_${hashString(parts.join("|")).toString(36)}`;
}

/**
 * Per-session, in-memory only. Never persisted and never shared between
 * users — a page reload starts empty.
 */
const sessionCache = new Map<string, VisualisationResponse>();

export function cachedVisualisation(signature: string): VisualisationResponse | undefined {
  return sessionCache.get(signature);
}

export function clearVisualisationCache(): void {
  sessionCache.clear();
}

export class VisualisationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "VisualisationError";
  }
}

/** Calls the visualisation endpoint. Resolves only with a real edited photo. */
export async function requestVisualisation(
  request: VisualisationRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<VisualisationResponse> {
  const signature = visualisationSignature(request);
  const cached = sessionCache.get(signature);
  if (cached) return cached;

  const response = await fetchImpl("/api/spaceplanner-visualise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => null)) as
    | { image?: unknown; error?: unknown; coverage?: CoverageReport }
    | null;

  if (!response.ok) {
    throw new VisualisationError(
      typeof payload?.error === "string" ? payload.error : `http_${response.status}`,
    );
  }
  if (typeof payload?.image !== "string" || !payload.image) {
    throw new VisualisationError("no_image_returned");
  }

  const result: VisualisationResponse = {
    image: payload.image,
    coverage: payload.coverage ?? null,
  };
  sessionCache.set(signature, result);
  return result;
}
