/**
 * Stage 11 — inventory reasoning.
 *
 * Turns fused detections into one intelligent inventory: three medium boxes
 * become "Medium box ×3", a bike becomes "Bicycle ×1", and each line carries
 * its own dimensions, weight, fragility, confidence and explanation.
 *
 * It also converts to the shapes the rest of EarnRoom already speaks —
 * `DetectedObject` for the review screens and `InventoryLine` for the planner
 * — so nothing downstream has to learn a new vocabulary.
 */
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import type { InventoryLine } from "@/lib/spaceplanner/types";
import type { DetectedObject } from "@/lib/vision/types";

import { buildConfidence, inventoryConfidence } from "./confidence";
import { classifyDetection } from "./classify";
import type {
  VisionDetection,
  VisionInventory,
  VisionObject,
  VisionViewpoint,
} from "./contracts";
import { estimateDimensions } from "./dimensions";
import { explainObject } from "./explain";
import { analyseFragility } from "./fragility";
import type { FusedDetection } from "./fusion";
import { detectionClass } from "./taxonomy";
import { estimateWeight } from "./weight";

/** Builds one fully reasoned object from a fused detection. */
export function buildObject(detection: FusedDetection): VisionObject {
  // A fused detection is one class, so any of its raw ids classify the same.
  const seedDetection: VisionDetection = {
    id: detection.detectionIds[0] ?? detection.classKey,
    photoId: detection.photoIds[0] ?? "",
    viewpoint: detection.viewpoints[0] ?? "unknown",
    classKey: detection.classKey,
    label: detection.label,
    detectionConfidence: detection.detectionConfidence,
    box: detection.boxes[0] ?? { x: 0, y: 0, w: 0.5, h: 0.5 },
    count: detection.quantity,
  };

  const classification = classifyDetection(seedDetection);
  const dimensions = estimateDimensions(detection);
  const weight = estimateWeight(dimensions, classification, detection.quantity);
  const fragility = analyseFragility(detection.classKey, classification);

  return {
    id: `obj-${detection.classKey}`,
    classKey: detection.classKey,
    label: detection.label,
    quantity: detection.quantity,
    classification,
    dimensions,
    weight,
    fragility,
    confidence: buildConfidence({
      detection: detection.detectionConfidence,
      classification: classification.classificationConfidence,
      dimension: dimensions.dimensionConfidence,
      weight: weight.weightConfidence,
    }),
    photoIds: [...detection.photoIds],
    viewpoints: [...detection.viewpoints],
    detectionIds: [...detection.detectionIds],
    catalogueId: detectionClass(detection.classKey)?.catalogueId ?? null,
    explanations: explainObject({ detection, classification, dimensions, weight, fragility }),
  };
}

export interface InventoryTotals {
  objectCount: number;
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  fragileCount: number;
  reviewCount: number;
}

export function totalsFor(objects: VisionObject[]): InventoryTotals {
  return {
    objectCount: objects.length,
    itemCount: objects.reduce((sum, object) => sum + object.quantity, 0),
    volumeM3:
      Math.round(
        objects.reduce((sum, object) => sum + object.dimensions.volumeM3 * object.quantity, 0) *
          100,
      ) / 100,
    weightKg: objects.reduce((sum, object) => sum + object.weight.totalKg, 0),
    fragileCount: objects.filter((object) => object.fragility.level !== "none").length,
    reviewCount: objects.filter((object) => object.confidence.needsReview).length,
  };
}

/** Inventory-level narration — what the engine did, in order. */
export function inventoryExplanations(objects: VisionObject[], photoCount: number): string[] {
  const totals = totalsFor(objects);
  const lines = [
    `${photoCount} photo${photoCount === 1 ? "" : "s"} produced ${totals.objectCount} distinct object${totals.objectCount === 1 ? "" : "s"} totalling ${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"}.`,
    `Estimated ${totals.volumeM3}m³ and about ${totals.weightKg}kg in total.`,
  ];
  const merged = objects.filter((object) => object.photoIds.length > 1);
  if (merged.length > 0) {
    lines.push(
      `${merged.length} object${merged.length === 1 ? " was" : "s were"} seen from more than one angle and merged instead of counted twice.`,
    );
  }
  if (totals.reviewCount > 0) {
    lines.push(
      `${totals.reviewCount} proposal${totals.reviewCount === 1 ? " needs" : "s need"} your review before planning — confidence was below 75%.`,
    );
  }
  return lines;
}

export function viewpointsIn(objects: VisionObject[]): VisionViewpoint[] {
  const set = new Set<VisionViewpoint>();
  for (const object of objects) for (const view of object.viewpoints) set.add(view);
  return [...set];
}

/* --------------------------------------------------------- conversions */

/** The shape the existing review screens already render. */
export function toDetectedObjects(inventory: VisionInventory): DetectedObject[] {
  return inventory.objects.map((object) => ({
    id: object.id,
    label: object.label,
    category: object.classification.category,
    confidence: object.confidence.overall,
    width: object.dimensions.widthCm,
    depth: object.dimensions.depthCm,
    height: object.dimensions.heightCm,
    weight: object.classification.weightClass,
    quantity: object.quantity,
    fragile: object.fragility.level !== "none",
    stackable: object.classification.stackable,
    catalogueId: object.catalogueId,
    photoIds: [...object.photoIds],
    source: "ai" as const,
  }));
}

/**
 * Planner lines, ready to pack. Objects with no catalogue equivalent are left
 * out of the plan rather than guessed at — they still appear in the inventory.
 */
export function toInventoryLines(inventory: VisionInventory): InventoryLine[] {
  const byItem = new Map<string, InventoryLine>();

  for (const object of inventory.objects) {
    if (!object.catalogueId) continue;
    const item = CATALOGUE_BY_ID.get(object.catalogueId);
    if (!item) continue;
    const existing = byItem.get(item.id);
    if (existing) existing.quantity += object.quantity;
    else byItem.set(item.id, { item, quantity: object.quantity });
  }

  return [...byItem.values()];
}

export { inventoryConfidence };
