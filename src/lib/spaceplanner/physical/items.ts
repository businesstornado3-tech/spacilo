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
/**
 * Things that hang on a wall and must never be planned as floor-standing.
 *
 * Phase 6R: the furniture that CARRIES a screen is not the screen. "TV stand",
 * "TV unit", "TV cabinet", "monitor arm" and friends are floor objects and
 * were previously swallowed by the bare `tv` alternative — which is exactly
 * why the TV stand kept vanishing from real plans.
 */
const WALL_MOUNTED =
  /\b(wall[- ]?mounted|wall[- ]?hung|tv|television|flat[- ]?screen|screen|monitor|wall art|picture frame|framed (?:print|picture|photo)|wall clock|wall shelf)\b/i;
/** Floor furniture that merely mentions a screen. Never wall-mounted. */
export const SCREEN_FURNITURE =
  /\b(stand|unit|cabinet|table|bench|console|sideboard|trolley|bracket|mount|box|remote|cover|case|bag)\b/i;
/** Flat, rigid things that are safely stored stood on edge. */
const UPRIGHT = /mattress|table ?top|door|board|panel|painting|mirror|rug|carpet|headboard/i;

/** Deterministic: is this canonical label a wall-mounted object? */
export function isWallMountedLabel(label: string): boolean {
  if (!WALL_MOUNTED.test(label)) return false;
  if (/\bwall[- ]?(mounted|hung|shelf|art|clock)\b/i.test(label)) return true;
  return !SCREEN_FURNITURE.test(label);
}


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
    wallMounted: isWallMountedLabel(object.label),
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
 * How much freedom the planner has with an object, 0 = none.
 *
 * A heavy, rigid, floor-dominant object has almost no valid positions, so it
 * must be placed before anything the engine can tuck in later. Purely a
 * function of the canonical record — no randomness, no model involvement.
 */
export function placementFlexibility(item: PlanningItem): number {
  let score = 0;
  if (item.stackable) score += 2;
  if (item.compressible) score += 1;
  if (item.allowUpright) score += 1;
  if (item.weight === "light") score += 2;
  else if (item.weight === "medium") score += 1;
  const footprintM2 = (item.widthCm * item.depthCm) / 10_000;
  if (footprintM2 < 0.15) score += 3;
  else if (footprintM2 < 0.35) score += 2;
  else if (footprintM2 < 0.8) score += 1;
  return score;
}

/**
 * Placement order: the least flexible, floor-dominant objects first — big
 * suitcases, cases and furniture take the walls and corners before anything
 * small or stackable is considered.
 */
export function placementOrder(a: StackCandidate, b: StackCandidate): number {
  const byFlexibility = placementFlexibility(a.item) - placementFlexibility(b.item);
  if (byFlexibility !== 0) return byFlexibility;
  const byWeight = BULK_RANK[a.item.weight] - BULK_RANK[b.item.weight];
  if (byWeight !== 0) return byWeight;
  const areaA = a.item.widthCm * a.item.depthCm;
  const areaB = b.item.widthCm * b.item.depthCm;
  if (areaA !== areaB) return areaB - areaA;
  // Same item stays together, so identical units end up adjacent.
  return a.item.id.localeCompare(b.item.id);
}
