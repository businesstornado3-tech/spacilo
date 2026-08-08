/**
 * The intelligence pipeline.
 *
 * Inventory → Vision → Dimensions → Volume → Packing → Recommendations →
 * Compatibility → Booking → Host review.
 *
 * Each stage produces a structured contract and can be run on its own; the
 * pipeline just sequences them and carries confidence forward. Long stages are
 * cancellable through a single AbortSignal, so leaving a screen mid-analysis
 * stops the work instead of orphaning it.
 */
import type {
  CompatibilityResult,
  DetectedInventory,
  DetectedSpace,
  InventoryLine,
  IntelligenceCapability,
  PackingResult,
  PricingEstimate,
  Recommendation,
  SpaceEstimate,
  StorageSpace,
  VisionPhoto,
} from "./contracts";
import { combineConfidence, type OverallConfidence } from "./confidence";
import { detectionConfidence } from "./mock/vision";
import { getProvider, runCapability } from "./registry";

export type PipelineStageId =
  | "vision"
  | "dimensions"
  | "volume"
  | "packing"
  | "recommendations"
  | "compatibility";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  capability: IntelligenceCapability;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: "vision", label: "Recognising your belongings", capability: "vision" },
  { id: "dimensions", label: "Estimating measurements", capability: "dimensions" },
  { id: "volume", label: "Working out the volume", capability: "packing" },
  { id: "packing", label: "Planning the layout", capability: "packing" },
  { id: "recommendations", label: "Writing recommendations", capability: "recommendations" },
  { id: "compatibility", label: "Checking it fits", capability: "booking" },
];

/* ------------------------------------------------------------- stages */

export function analyseBelongings(
  photos: VisionPhoto[],
  signal?: AbortSignal,
): Promise<DetectedInventory> {
  return runCapability(
    "vision",
    () => getProvider("vision").analyseBelongings(photos, signal ? { signal } : {}),
    {
      event: "VisionCompleted",
      confidence: detectionConfidence,
      detail: (result) => ({ objects: result.objects.length }),
    },
  );
}

export function analyseSpace(
  photos: VisionPhoto[],
  spaceType?: string,
  signal?: AbortSignal,
): Promise<DetectedSpace> {
  return runCapability(
    "spaceAnalysis",
    () => getProvider("spaceAnalysis").analyseSpace(photos, spaceType, signal ? { signal } : {}),
    { event: "SpaceScanned", detail: (result) => ({ volumeM3: result.usableVolumeM3 }) },
  );
}

export function estimateDimensions(
  photos: VisionPhoto[],
  spaceType?: string,
  signal?: AbortSignal,
): Promise<SpaceEstimate> {
  return runCapability(
    "dimensions",
    () =>
      getProvider("dimensions").estimateDimensions(
        spaceType ? { photos, spaceType } : { photos },
        signal ? { signal } : {},
      ),
    {
      event: "DimensionsEstimated",
      confidence: (result) =>
        result.dimensions.reduce((sum, d) => sum + d.confidence, 0) /
        Math.max(1, result.dimensions.length),
    },
  );
}

export function packInventory(
  lines: InventoryLine[],
  space: StorageSpace,
  signal?: AbortSignal,
): Promise<PackingResult> {
  return runCapability(
    "packing",
    () => getProvider("packing").pack(lines, space, signal ? { signal } : {}),
    {
      event: "PlannerCompleted",
      confidence: (result) => result.score.value / 100,
      detail: (result) => ({ score: result.score.value, band: result.score.band }),
    },
  );
}

export function recommendFor(
  result: PackingResult,
  signal?: AbortSignal,
): Promise<Recommendation[]> {
  return runCapability(
    "recommendations",
    () => getProvider("recommendations").recommend(result, signal ? { signal } : {}),
    { event: "RecommendationUpdated", detail: (out) => ({ count: out.length }) },
  );
}

export function assessCompatibility(
  result: PackingResult,
  signal?: AbortSignal,
): Promise<CompatibilityResult> {
  return runCapability(
    "booking",
    () => getProvider("booking").assessCompatibility(result, signal ? { signal } : {}),
    {
      event: "BookingAnalysed",
      confidence: (out) => out.score.value / 100,
      detail: (out) => ({ verdict: out.verdict }),
    },
  );
}

export function estimatePrice(
  input: { spaceType: string; volumeM3: number; postcode?: string; access?: string },
  signal?: AbortSignal,
): Promise<PricingEstimate> {
  return runCapability(
    "pricing",
    () => getProvider("pricing").estimatePrice(input, signal ? { signal } : {}),
    { event: "PricingEstimated", detail: (out) => ({ monthlyPence: out.monthlyPence }) },
  );
}

/* ----------------------------------------------------------- full run */

export interface PipelineInput {
  /** Either photos (vision path) or ready-made lines (manual path). */
  photos?: VisionPhoto[];
  lines: InventoryLine[];
  space: StorageSpace;
  signal?: AbortSignal;
}

export interface PipelineResult {
  inventory: DetectedInventory | null;
  packing: PackingResult;
  recommendations: Recommendation[];
  compatibility: CompatibilityResult;
  confidence: OverallConfidence;
}

/**
 * Runs the whole chain. Vision is optional: someone who typed their inventory
 * in by hand gets the same downstream intelligence, just without a vision
 * confidence term.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { signal } = input;
  const inventory =
    input.photos && input.photos.length > 0 ? await analyseBelongings(input.photos, signal) : null;

  const packing = await packInventory(input.lines, input.space, signal);
  const recommendations = await recommendFor(packing, signal);
  const compatibility = await assessCompatibility(packing, signal);

  const parts: Array<{ capability: IntelligenceCapability; value: number }> = [
    { capability: "packing", value: packing.score.value / 100 },
    { capability: "booking", value: compatibility.score.value / 100 },
    {
      capability: "recommendations",
      value: recommendations.length
        ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
        : 0.9,
    },
  ];
  if (inventory) parts.unshift({ capability: "vision", value: detectionConfidence(inventory) });

  return {
    inventory,
    packing,
    recommendations,
    compatibility,
    confidence: combineConfidence(parts),
  };
}
