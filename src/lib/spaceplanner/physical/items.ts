/**
 * Phase 6E — confirmed inventory → planning items and stackable footprints.
 *
 * The canonical ITEM-nnn identity survives every step here. Nothing is
 * collapsed into a catalogue lookalike, nothing is split into its components,
 * and a rigid object is never quietly compressed to make a plan work.
 */
import type { DetectedObject } from "@/lib/vision/types";
import type { WeightClass } from "../types";
import { ACCESS_DEFAULTS } from "./space";
import type { Orientation, PlanningItem } from "./types";

/** Soft goods that may genuinely lose a little volume when packed. */
const COMPRESSIBLE = /bag|duvet|bedding|pillow|cushion|clothes|clothing|linen|sack|holdall/i;
/** Flat, rigid things that are safely stored stood on edge. */
const UPRIGHT = /mattress|table ?top|door|board|panel|painting|mirror|rug|carpet|headboard/i;

export const MAX_UNITS_PER_STACK = 4;

export function planningItemFrom(object: DetectedObject): PlanningItem {
  return {
    id: object.id,
    label: object.label,
    category: object.category,
    quantity: Math.max(0, Math.round(object.quantity)),
    widthCm: Math.max(3, object.width),
    depthCm: Math.max(3, object.depth),
    heightCm: Math.max(3, object.height),
    weight: object.weight,
    stackable: object.stackable,
    fragile: object.fragile,
    compressible: COMPRESSIBLE.test(object.label),
    allowUpright: UPRIGHT.test(object.label),
    components: object.components ?? [],
    confidence: object.confidence,
    dimensionBasis: object.source === "manual" ? "confirmed" : "estimated",
    photoIds: object.photoIds,
    ...(object.selectionId ? { selectionId: object.selectionId } : {}),
  };
}

export function planningItemsFrom(objects: DetectedObject[]): PlanningItem[] {
  return objects
    .filter((object) => object.quantity > 0 && object.label.trim().length > 0)
    .map(planningItemFrom);
}

export interface OrientationOption {
  w: number;
  d: number;
  h: number;
  rotationDeg: 0 | 90;
  orientation: Orientation;
}

const m = (cm: number) => Math.round(cm) / 100;

/**
 * Every orientation the item may physically take, cheapest footprint first.
 * An orientation that cannot exist for this object is never produced.
 */
export function orientationsFor(item: PlanningItem, ceilingM: number): OrientationOption[] {
  const w = m(item.widthCm);
  const d = m(item.depthCm);
  const h = m(item.heightCm);
  const options: OrientationOption[] = [
    { w, d, h, rotationDeg: 0, orientation: "flat" },
    { w: d, d: w, h, rotationDeg: 90, orientation: "rotated" },
  ];

  if (item.allowUpright) {
    const [longest, middle, shortest] = [w, d, h].sort((a, b) => b - a) as [number, number, number];
    if (middle <= Math.min(ceilingM, ACCESS_DEFAULTS.maxStackHeightM)) {
      options.push({
        w: longest,
        d: shortest,
        h: middle,
        rotationDeg: 0,
        orientation: "upright",
      });
      options.push({
        w: shortest,
        d: longest,
        h: middle,
        rotationDeg: 90,
        orientation: "upright",
      });
    }
  }

  return options
    .filter((option) => option.h <= ceilingM + 0.001)
    .sort((a, b) => a.w * a.d - b.w * b.d);
}

/** A group of identical units planned as one footprint (a stack, or a single). */
export interface StackCandidate {
  item: PlanningItem;
  units: number;
  groupId: string;
}

/** How many identical units may safely sit in one column. */
export function unitsPerStack(item: PlanningItem, ceilingM: number): number {
  if (!item.stackable) return 1;
  const limit = Math.min(ceilingM, ACCESS_DEFAULTS.maxStackHeightM);
  const unitHeight = Math.max(0.05, m(item.heightCm));
  const byHeight = Math.floor(limit / unitHeight);
  const byWeight = item.weight === "heavy" ? 1 : item.weight === "medium" ? 2 : MAX_UNITS_PER_STACK;
  const byFragility = item.fragile ? 1 : MAX_UNITS_PER_STACK;
  return Math.max(1, Math.min(byHeight, byWeight, byFragility, MAX_UNITS_PER_STACK));
}

/** Splits every item's quantity into the columns the packer will place. */
export function stacksFor(items: PlanningItem[], ceilingM: number): StackCandidate[] {
  const out: StackCandidate[] = [];
  for (const item of items) {
    const per = unitsPerStack(item, ceilingM);
    let remaining = item.quantity;
    let index = 0;
    while (remaining > 0) {
      const units = Math.min(per, remaining);
      remaining -= units;
      out.push({ item, units, groupId: `group-${item.id}` });
      index += 1;
      if (index > 200) break; // defensive: never loop on bad input
    }
  }
  return out;
}

const BULK_RANK: Record<WeightClass, number> = { heavy: 0, medium: 1, light: 2 };

/**
 * Placement order: heavy and bulky first so they take the walls and corners,
 * light items last so they cluster around what is already there.
 */
export function placementOrder(a: StackCandidate, b: StackCandidate): number {
  const byWeight = BULK_RANK[a.item.weight] - BULK_RANK[b.item.weight];
  if (byWeight !== 0) return byWeight;
  const areaA = a.item.widthCm * a.item.depthCm;
  const areaB = b.item.widthCm * b.item.depthCm;
  if (areaA !== areaB) return areaB - areaA;
  // Same item stays together, so identical units end up adjacent.
  return a.item.id.localeCompare(b.item.id);
}
