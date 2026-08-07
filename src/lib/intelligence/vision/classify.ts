/**
 * Stage 3 — smart classification.
 *
 * Turns a raw detection into everything storage actually cares about:
 * category, subcategory, storage type, fragility, stackability, orientation,
 * handling, weight class and a hazard prompt.
 *
 * The hazard flag is a prompt for a human check. Vision never decides whether
 * something is permitted or lawful — the policy engine and people do that.
 */
import type { VisionClassification, VisionDetection } from "./contracts";
import { detectionClass } from "./taxonomy";

export function classifyDetection(detection: VisionDetection): VisionClassification {
  const entry = detectionClass(detection.classKey);
  if (!entry) {
    return {
      category: "boxes",
      subcategory: "Unidentified",
      storageType: "boxed",
      fragile: false,
      stackable: false,
      maxStack: 1,
      orientation: "as_found",
      handling: "A person should confirm what this is before it is stored.",
      weightClass: "medium",
      hazard: "needs_human_review",
      classificationConfidence: 0.4,
    };
  }

  // Classification is a shade more certain than detection: once the shape is
  // found, the taxonomy row supplies the rest with no further guessing.
  const classificationConfidence =
    Math.round(Math.min(0.99, detection.detectionConfidence + 0.04) * 100) / 100;

  return {
    category: entry.category,
    subcategory: entry.subcategory,
    storageType: entry.storageType,
    fragile: entry.fragile,
    stackable: entry.stackable,
    maxStack: entry.maxStack,
    orientation: entry.orientation,
    handling: entry.handling,
    weightClass: entry.weight,
    hazard: entry.hazard,
    classificationConfidence,
  };
}
