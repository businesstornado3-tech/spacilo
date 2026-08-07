/**
 * Stage 9 — explainability.
 *
 * Every object explains itself. Not marketing copy: each line names the cue,
 * the evidence and the number behind a decision, so a person can agree or
 * correct it. If a decision cannot be explained, it should not be shown.
 */
import type {
  VisionClassification,
  VisionDimensions,
  VisionFragility,
  VisionObject,
  VisionWeight,
} from "./contracts";
import type { FusedDetection } from "./fusion";
import { detectionClass } from "./taxonomy";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function explainObject(input: {
  detection: FusedDetection;
  classification: VisionClassification;
  dimensions: VisionDimensions;
  weight: VisionWeight;
  fragility: VisionFragility;
}): string[] {
  const { detection, classification, dimensions, weight, fragility } = input;
  const entry = detectionClass(detection.classKey);
  const lines: string[] = [];

  lines.push(
    `Detected as ${detection.label} because ${entry?.cue ?? "the outline matched a known shape"} matched with ${percent(detection.detectionConfidence)} confidence.`,
  );

  if (detection.photoIds.length > 1) {
    lines.push(
      `Seen in ${detection.photoIds.length} photos from ${detection.viewpoints.join(", ")} — merged into one object because the class and position matched.`,
    );
  }

  if (detection.quantity > 1) {
    lines.push(
      `Counted ${detection.quantity} because that was the most visible in any single frame; overlapping frames were not added together.`,
    );
  }

  lines.push(
    `${dimensions.widthCm} × ${dimensions.depthCm} × ${dimensions.heightCm}cm estimated (${dimensions.minCm.width}–${dimensions.maxCm.width}cm wide). ${dimensions.basis}`,
  );

  lines.push(
    `About ${weight.perUnitKg}kg each, from ${dimensions.volumeM3}m³ at ${classification.weightClass} density — ${
      weight.heavyLift
        ? "a heavy lift"
        : weight.twoPersonLift
          ? "a two-person lift"
          : "a one-person lift"
    }.`,
  );

  if (classification.stackable) {
    lines.push(
      `Stackable up to ${classification.maxStack} high, carrying about ${weight.safeStackLoadKg}kg on top.`,
    );
  } else {
    lines.push("Not stacked, because this shape does not carry weight safely.");
  }

  if (fragility.level !== "none") {
    lines.push(`Treated as ${fragility.level} fragility: ${fragility.reasons.join(" ")}`);
  }

  if (classification.orientation !== "as_found") {
    lines.push(`Stored ${classification.orientation.replace(/_/g, " ")} — ${classification.handling}`);
  }

  if (classification.hazard !== "none") {
    lines.push(
      `Flagged for a human check (${classification.hazard.replace(/_/g, " ")}). Spacilo AI does not decide what may be stored — you and your host confirm against the storage policy.`,
    );
  }

  return lines;
}

/** One sentence for compact surfaces such as a card subtitle. */
export function summariseObject(object: VisionObject): string {
  return `${object.label} ×${object.quantity} — ${object.dimensions.widthCm}×${object.dimensions.depthCm}×${object.dimensions.heightCm}cm, about ${object.weight.totalKg}kg, ${percent(object.confidence.overall)} confidence.`;
}
