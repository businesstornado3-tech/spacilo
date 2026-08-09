/**
 * Phase 6Q — deterministic physical object classification.
 *
 * Every planning item falls into exactly one physical class, decided only from
 * its canonical attributes (dimensions, weight, stackability, compressibility,
 * wall-mounting). No model is consulted, no randomness is involved, and the
 * same item always lands in the same class.
 *
 * The class drives the placement hierarchy: fixed and wall-mounted objects are
 * positioned before anything else, and small items are never allowed to
 * fragment the floor before the large objects have their positions.
 */
import type { PlanningItem } from "./types";

export type PhysicalClass =
  | "WALL_MOUNTED"
  | "FIXED_FEATURE"
  | "LARGE_FLOOR_OBJECT"
  | "FURNITURE"
  | "STACKABLE_CONTAINER"
  | "SOFT_FLEXIBLE"
  | "SMALL_ITEM";

/** Placement order. Lower runs first. */
export const CLASS_ORDER: Record<PhysicalClass, number> = {
  WALL_MOUNTED: 0,
  FIXED_FEATURE: 1,
  LARGE_FLOOR_OBJECT: 2,
  FURNITURE: 3,
  SOFT_FLEXIBLE: 4,
  STACKABLE_CONTAINER: 5,
  SMALL_ITEM: 6,
};

/** Anything with a footprint at or below this is a small item, in m². */
export const SMALL_ITEM_FOOTPRINT_M2 = 0.12;
/** …and no taller than this. */
export const SMALL_ITEM_HEIGHT_M = 0.6;
/** A single object of this footprint or more dominates the floor. */
export const LARGE_FLOOR_FOOTPRINT_M2 = 0.75;

const FIXED = /radiator|boiler|meter|fuse ?box|socket|pipe|column|stair|built[- ]?in|fitted/i;
const CONTAINER = /box|crate|tote|carton|container|storage bin|plastic bin/i;

/** The item's class. Deterministic and total: every item gets exactly one. */
export function classifyItem(item: PlanningItem): PhysicalClass {
  if (item.wallMounted) return "WALL_MOUNTED";
  if (FIXED.test(item.label)) return "FIXED_FEATURE";

  const footprintM2 = (item.widthCm * item.depthCm) / 10_000;
  const heightM = item.heightCm / 100;

  if (footprintM2 <= SMALL_ITEM_FOOTPRINT_M2 && heightM <= SMALL_ITEM_HEIGHT_M) {
    return "SMALL_ITEM";
  }
  if (footprintM2 >= LARGE_FLOOR_FOOTPRINT_M2 || item.weight === "heavy") {
    return "LARGE_FLOOR_OBJECT";
  }
  if (item.compressible) return "SOFT_FLEXIBLE";
  if (item.stackable && CONTAINER.test(item.label)) return "STACKABLE_CONTAINER";
  if (item.stackable && footprintM2 < 0.35) return "STACKABLE_CONTAINER";
  return "FURNITURE";
}

/** True when the item must be consolidated rather than placed on its own. */
export function isSmallItem(item: PlanningItem): boolean {
  return classifyItem(item) === "SMALL_ITEM";
}

/**
 * Deterministic placement order across classes, then by bulk, then by id.
 * Large before small, always — a tiny object can never fragment the floor
 * ahead of a wardrobe.
 */
export function classPlacementOrder(a: PlanningItem, b: PlanningItem): number {
  const byClass = CLASS_ORDER[classifyItem(a)] - CLASS_ORDER[classifyItem(b)];
  if (byClass !== 0) return byClass;
  const areaA = a.widthCm * a.depthCm;
  const areaB = b.widthCm * b.depthCm;
  if (areaA !== areaB) return areaB - areaA;
  const volumeA = areaA * a.heightCm;
  const volumeB = areaB * b.heightCm;
  if (volumeA !== volumeB) return volumeB - volumeA;
  return a.id.localeCompare(b.id);
}
