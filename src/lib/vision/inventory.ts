/**
 * Detected-inventory maths and editing.
 *
 * Pure functions only. Multi-photo detections merge here, users edit here, and
 * the result feeds the existing SpacePlanner engine unchanged.
 */
import { DENSITY_KG_PER_M3 } from "@/lib/spaceplanner/library";
import type { ItemCategory } from "@/lib/spaceplanner/types";
import { classVolume } from "./taxonomy";
import { mergeAcrossPhotos, type MergeReport } from "./merge";
import { needsReview, type DetectedObject } from "./types";

export function objectVolume(object: DetectedObject): number {
  return classVolume(object) * object.quantity;
}

export function objectWeightKg(object: DetectedObject): number {
  return Math.round(objectVolume(object) * DENSITY_KG_PER_M3[object.weight]);
}

/**
 * Merges detections proposed from different photos.
 *
 * Phase 6AA: the merge is the deterministic UNION of every view (see
 * `./merge`). Two photographs of the same belongings increase recall; a
 * genuine duplicate view of one physical object collapses; two visually
 * different objects that happen to share a noun never do.
 */
export function mergeDetections(objects: DetectedObject[]): DetectedObject[] {
  return mergeDetectionsWithReport(objects).objects;
}

/**
 * Phase 6AB — the same merge, with the identity-resolution report attached so
 * diagnostics can show raw detections vs unique physical objects.
 */
export function mergeDetectionsWithReport(objects: DetectedObject[]): {
  objects: DetectedObject[];
  report: MergeReport;
} {
  const merged = mergeAcrossPhotos(objects);
  return {
    objects: [...merged.objects].sort((a, b) => b.confidence - a.confidence),
    report: merged.report,
  };
}


export interface DetectedInventorySummary {
  objectCount: number;
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  fragileCount: number;
  furnitureCount: number;
  boxCount: number;
  reviewCount: number;
  /** Mean AI confidence across proposals, 0–1. */
  averageConfidence: number;
}

const countIn = (objects: DetectedObject[], category: ItemCategory) =>
  objects.filter((o) => o.category === category).reduce((sum, o) => sum + o.quantity, 0);

export function summariseDetections(objects: DetectedObject[]): DetectedInventorySummary {
  const volume = objects.reduce((sum, o) => sum + objectVolume(o), 0);
  const ai = objects.filter((o) => o.source === "ai");

  return {
    objectCount: objects.length,
    itemCount: objects.reduce((sum, o) => sum + o.quantity, 0),
    volumeM3: Math.round(volume * 100) / 100,
    weightKg: objects.reduce((sum, o) => sum + objectWeightKg(o), 0),
    fragileCount: objects.filter((o) => o.fragile).reduce((sum, o) => sum + o.quantity, 0),
    furnitureCount: countIn(objects, "furniture"),
    boxCount: countIn(objects, "boxes"),
    reviewCount: objects.filter(needsReview).length,
    averageConfidence: ai.length
      ? Math.round((ai.reduce((sum, o) => sum + o.confidence, 0) / ai.length) * 100) / 100
      : 1,
  };
}

/* ---------------------------------------------------------------- editing */

export function updateObject(
  objects: DetectedObject[],
  id: string,
  patch: Partial<DetectedObject>,
): DetectedObject[] {
  return objects.map((object) =>
    object.id === id
      ? { ...object, ...patch, quantity: Math.max(1, patch.quantity ?? object.quantity) }
      : object,
  );
}

export function removeObject(objects: DetectedObject[], id: string): DetectedObject[] {
  return objects.filter((object) => object.id !== id);
}

export function duplicateObject(objects: DetectedObject[], id: string): DetectedObject[] {
  const index = objects.findIndex((object) => object.id === id);
  if (index < 0) return objects;
  const original = objects[index]!;
  const copy: DetectedObject = {
    ...original,
    id: `${original.id}-copy-${objects.length}`,
    source: "manual",
    photoIds: [...original.photoIds],
  };
  return [...objects.slice(0, index + 1), copy, ...objects.slice(index + 1)];
}

/** Splits a quantity of N into one object of N-1 and one of 1. */
export function splitObject(objects: DetectedObject[], id: string): DetectedObject[] {
  const index = objects.findIndex((object) => object.id === id);
  if (index < 0) return objects;
  const original = objects[index]!;
  if (original.quantity < 2) return objects;

  const kept: DetectedObject = { ...original, quantity: original.quantity - 1 };
  const split: DetectedObject = {
    ...original,
    id: `${original.id}-split-${objects.length}`,
    quantity: 1,
    source: "manual",
    photoIds: [...original.photoIds],
  };
  return [...objects.slice(0, index), kept, split, ...objects.slice(index + 1)];
}

/** Merges the second object into the first, summing quantities. */
export function mergeObjects(
  objects: DetectedObject[],
  targetId: string,
  sourceId: string,
): DetectedObject[] {
  if (targetId === sourceId) return objects;
  const target = objects.find((object) => object.id === targetId);
  const source = objects.find((object) => object.id === sourceId);
  if (!target || !source) return objects;

  return objects
    .filter((object) => object.id !== sourceId)
    .map((object) =>
      object.id === targetId
        ? {
            ...object,
            quantity: object.quantity + source.quantity,
            confidence: Math.min(object.confidence, source.confidence),
            photoIds: Array.from(new Set([...object.photoIds, ...source.photoIds])),
          }
        : object,
    );
}

/** A manually added object, so nothing is ever trapped behind the AI. */
export function manualObject(label: string, category: ItemCategory = "boxes"): DetectedObject {
  return {
    id: `manual-${Date.now()}-${Math.round(label.length)}`,
    label,
    category,
    confidence: 1,
    width: 45,
    depth: 35,
    height: 35,
    weight: "medium",
    quantity: 1,
    fragile: false,
    stackable: true,
    catalogueId: "medium-box",
    photoIds: [],
    source: "manual",
  };
}

/* --------------------------------------------------- planner integration */

/**
 * Detected objects → SpacePlanner quantities. Objects with no catalogue match
 * are folded onto the closest box size, so nothing silently disappears from
 * the plan.
 */
export function toPlannerQuantities(objects: DetectedObject[]): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const object of objects) {
    const id = object.catalogueId ?? (classVolume(object) > 0.15 ? "large-box" : "medium-box");
    quantities[id] = (quantities[id] ?? 0) + object.quantity;
  }
  return quantities;
}
