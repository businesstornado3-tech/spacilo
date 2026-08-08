/**
 * Unified confidence model.
 *
 * Every capability reports confidence the same way, on the same 0–1 scale,
 * with the same wording — so "94%" means the same thing under a packing plan
 * as it does under a detected bicycle. Overall confidence is the weighted mean
 * of the parts actually present; nothing is invented to fill a gap.
 */
import type { IntelligenceCapability } from "./contracts";

export type ConfidenceBand = "high" | "good" | "moderate" | "low";

export interface ConfidenceScore {
  /** 0–1. */
  value: number;
  band: ConfidenceBand;
  /** Percentage for display, already rounded. */
  percent: number;
  label: string;
}

/**
 * How much each capability counts towards overall intelligence confidence.
 * Vision and dimensions lead because every later stage inherits their error.
 */
export const CONFIDENCE_WEIGHTS: Record<IntelligenceCapability, number> = {
  vision: 3,
  "space-analysis": 3,
  dimensions: 3,
  ocr: 1,
  packing: 2,
  recommendations: 1,
  pricing: 1,
  learning: 1,
  booking: 2,
};

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function bandFor(value: number): ConfidenceBand {
  if (value >= 0.9) return "high";
  if (value >= 0.75) return "good";
  if (value >= 0.55) return "moderate";
  return "low";
}

export function labelFor(band: ConfidenceBand): string {
  switch (band) {
    case "high":
      return "High confidence";
    case "good":
      return "Good confidence";
    case "moderate":
      return "Worth a check";
    case "low":
      return "Needs your review";
  }
}

export function confidence(value: number): ConfidenceScore {
  const clamped = clampConfidence(value);
  const band = bandFor(clamped);
  return {
    value: clamped,
    band,
    percent: Math.round(clamped * 100),
    label: labelFor(band),
  };
}

export interface CapabilityConfidence {
  capability: IntelligenceCapability;
  score: ConfidenceScore;
}

export interface OverallConfidence {
  overall: ConfidenceScore;
  parts: CapabilityConfidence[];
}

/** Weighted mean across whatever ran. An empty run is honestly zero. */
export function combineConfidence(
  parts: Array<{ capability: IntelligenceCapability; value: number }>,
): OverallConfidence {
  const scored = parts.map((part) => ({
    capability: part.capability,
    score: confidence(part.value),
  }));

  const totals = parts.reduce(
    (acc, part) => {
      const weight = CONFIDENCE_WEIGHTS[part.capability] ?? 1;
      return {
        weight: acc.weight + weight,
        sum: acc.sum + clampConfidence(part.value) * weight,
      };
    },
    { weight: 0, sum: 0 },
  );

  return {
    overall: confidence(totals.weight === 0 ? 0 : totals.sum / totals.weight),
    parts: scored,
  };
}

/** Below this, the platform asks a human to look before anything counts. */
export const REVIEW_THRESHOLD = 0.75;

export function needsHumanReview(value: number): boolean {
  return clampConfidence(value) < REVIEW_THRESHOLD;
}
