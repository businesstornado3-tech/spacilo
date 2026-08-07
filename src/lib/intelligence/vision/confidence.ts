/**
 * Stage 8 — the confidence engine.
 *
 * Four stage confidences, one combined figure, one band, one review flag —
 * computed the same way for every object so a percentage always means the
 * same thing. Later stages inherit earlier error, so the combination is
 * weighted towards detection and classification rather than averaged flat.
 */
import type { VisionConfidence, VisionObject } from "./contracts";

const WEIGHTS = { detection: 0.35, classification: 0.3, dimension: 0.2, weight: 0.15 } as const;

/** Below this, a human look is asked for before the object counts. */
export const REVIEW_THRESHOLD = 0.75;

export function bandFor(value: number): VisionConfidence["band"] {
  if (value >= 0.9) return "high";
  if (value >= 0.75) return "good";
  if (value >= 0.55) return "moderate";
  return "low";
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function buildConfidence(parts: {
  detection: number;
  classification: number;
  dimension: number;
  weight: number;
}): VisionConfidence {
  const overall =
    Math.round(
      (clamp(parts.detection) * WEIGHTS.detection +
        clamp(parts.classification) * WEIGHTS.classification +
        clamp(parts.dimension) * WEIGHTS.dimension +
        clamp(parts.weight) * WEIGHTS.weight) *
        100,
    ) / 100;

  return {
    detection: clamp(parts.detection),
    classification: clamp(parts.classification),
    dimension: clamp(parts.dimension),
    weight: clamp(parts.weight),
    overall,
    band: bandFor(overall),
    needsReview: overall < REVIEW_THRESHOLD,
  };
}

/** Confidence across a whole inventory, weighted by how much each object is. */
export function inventoryConfidence(objects: VisionObject[]): VisionConfidence {
  if (objects.length === 0) {
    return buildConfidence({ detection: 0, classification: 0, dimension: 0, weight: 0 });
  }

  const totalUnits = objects.reduce((sum, object) => sum + object.quantity, 0) || 1;
  const mean = (pick: (object: VisionObject) => number) =>
    objects.reduce((sum, object) => sum + pick(object) * object.quantity, 0) / totalUnits;

  return buildConfidence({
    detection: mean((object) => object.confidence.detection),
    classification: mean((object) => object.confidence.classification),
    dimension: mean((object) => object.confidence.dimension),
    weight: mean((object) => object.confidence.weight),
  });
}
