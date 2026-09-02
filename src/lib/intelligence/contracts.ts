/**
 * EarnRoom Intelligence Platform (SIP) — standard data contracts.
 *
 * Every intelligence capability speaks these shapes, whichever provider is
 * active. Nothing above this layer imports a vendor SDK, a model name or a
 * provider-specific response: components consume contracts only.
 *
 * Where a contract already exists elsewhere in the codebase (detected objects,
 * planner placements, price suggestions) it is re-exported rather than
 * duplicated — one definition, one source of truth.
 */
import type {
  DetectedObject,
  SpaceScanResult,
  VisionPhoto,
  VisionResult,
} from "@/lib/vision/types";
import type {
  InventoryLine,
  PackResult,
  SpacePlan,
  StorageSpace,
  WeightClass,
} from "@/lib/spaceplanner/types";
import type { EarnRoomScore } from "@/lib/spaceplanner/score";

export type { DetectedObject, VisionPhoto, VisionResult, SpaceScanResult };
export type { InventoryLine, PackResult, SpacePlan, StorageSpace, WeightClass };
export type { EarnRoomScore };

/** Everything the platform proposes carries provenance and a confidence. */
export interface IntelligenceMeta {
  /** Provider id that produced the output, e.g. `mock-vision-v1`. */
  provider: string;
  /** Model or engine identifier, never a secret. */
  model: string;
  /** Contract version, so stored results stay readable after upgrades. */
  contractVersion: string;
  producedAt: number;
  /** Milliseconds spent producing the result. */
  latencyMs: number;
}

export const CONTRACT_VERSION = "sip-1";

/** A group of things someone owns, as observed rather than measured. */
export interface DetectedInventory {
  objects: DetectedObject[];
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  photoIds: string[];
  meta: IntelligenceMeta;
}

/** A room or space, as observed. Every figure is an estimate. */
export interface DetectedSpace {
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  usableAreaM2: number;
  usableVolumeM3: number;
  observations: string[];
  meta: IntelligenceMeta;
}

/** One estimated measurement with its own confidence. */
export interface DimensionEstimate {
  /** What was measured, e.g. `width`, `doorWidth`, `ceilingHeight`. */
  id: string;
  label: string;
  /** Centimetres — the platform's single length unit. */
  valueCm: number;
  /** Plausible range around the estimate. */
  minCm: number;
  maxCm: number;
  confidence: number;
  basis: string;
}

/** A whole-space geometry proposal built from dimension estimates. */
export interface SpaceEstimate {
  dimensions: DimensionEstimate[];
  usableVolumeM3: number;
  meta: IntelligenceMeta;
}

export type RecommendationKind =
  | "orientation"
  | "stacking"
  | "placement"
  | "access"
  | "safety"
  | "capacity";

export type RecommendationImpact = "high" | "medium" | "low";

/**
 * Explainability is part of the contract, not an add-on: a recommendation
 * without a reason and evidence cannot be constructed.
 */
export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  /** What to do, in plain English. */
  action: string;
  /** Why it is being suggested. */
  reason: string;
  /** The facts the reason rests on — measurements, counts, checks. */
  evidence: string[];
  confidence: number;
  impact: RecommendationImpact;
}

export interface PackingResult {
  plan: SpacePlan;
  score: EarnRoomScore;
  meta: IntelligenceMeta;
}

export interface PricingEstimate {
  /** Pence per month, so no floating-point money ever leaves the platform. */
  monthlyPence: number;
  lowPence: number;
  highPence: number;
  basis: string[];
  meta: IntelligenceMeta;
}

export type CompatibilityVerdict = "fits" | "tight" | "does_not_fit";

export interface CompatibilityResult {
  verdict: CompatibilityVerdict;
  /** 0–100 estimate of how much of the required volume the space covers. */
  fitPercent: number;
  score: EarnRoomScore;
  recommendations: Recommendation[];
  meta: IntelligenceMeta;
}

/** Feedback the learning provider records. Never carries personal data. */
export interface LearningSignal {
  capability: IntelligenceCapability;
  /** Stable, non-identifying subject key, e.g. a catalogue id. */
  subject: string;
  /** `accepted` when a human kept the proposal, `corrected` when they edited it. */
  outcome: "accepted" | "corrected" | "rejected";
  /** Optional non-identifying magnitude of the correction. */
  delta?: number;
}

export interface LearningSummary {
  signals: number;
  acceptanceRate: number;
  /** Confidence multiplier the platform applies, clamped to a safe band. */
  calibration: number;
  meta: IntelligenceMeta;
}

/** Capabilities a provider may advertise. Components gate on these. */
export type IntelligenceCapability =
  | "vision"
  | "space-analysis"
  | "dimensions"
  | "ocr"
  | "packing"
  | "recommendations"
  | "pricing"
  | "learning"
  | "booking";

export const INTELLIGENCE_CAPABILITIES: IntelligenceCapability[] = [
  "vision",
  "space-analysis",
  "dimensions",
  "ocr",
  "packing",
  "recommendations",
  "pricing",
  "learning",
  "booking",
];
