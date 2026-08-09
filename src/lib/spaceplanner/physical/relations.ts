/**
 * Phase 6R — deterministic relationships, support surfaces and storage zones.
 *
 * Three purely arithmetic/lexical decisions live here, all derived from the
 * canonical record alone. No model is consulted, nothing is random, and the
 * same manifest always produces the same answer:
 *
 *   1. RELATIONSHIPS — a television belongs next to its stand, a monitor next
 *      to its desk. Related objects attract each other during placement and a
 *      wall-mounted partner never causes its floor partner to be discarded.
 *   2. SUPPORT SURFACES — which objects can physically carry another object on
 *      top, and which small objects belong on a surface rather than the floor.
 *   3. STORAGE ZONES — luggage with luggage, boxes with boxes, small items in
 *      one consolidated zone. This is what makes a plan read as "organised"
 *      rather than "each object went wherever a rectangle was free".
 */
import { classifyItem } from "./classify";
import type { PlanningItem } from "./types";

/* ------------------------------------------------------------- zones */

export type StorageZone = "luggage" | "boxes" | "furniture" | "soft" | "fragile" | "small";

const LUGGAGE = /suitcase|case\b|luggage|holdall|duffel|duffle|backpack|rucksack|trolley bag|travel bag/i;
const BOXES = /box|crate|tote|carton|container|storage bin|plastic bin|basket/i;
const FURNITURE = /stand|table|desk|chair|shelf|shelving|cabinet|drawer|unit|bench|console|sideboard|wardrobe/i;
const SOFT = /bedding|duvet|pillow|cushion|clothes|clothing|linen|sack|blanket|rug|bag\b/i;

/** The zone an item belongs to. Total and deterministic. */
export function storageZoneFor(item: PlanningItem): StorageZone {
  if (item.fragile) return "fragile";
  const cls = classifyItem(item);
  if (cls === "SMALL_ITEM") return "small";
  if (LUGGAGE.test(item.label)) return "luggage";
  if (BOXES.test(item.label)) return "boxes";
  if (FURNITURE.test(item.label) || item.wallMounted) return "furniture";
  if (SOFT.test(item.label) || item.compressible) return "soft";
  return "boxes";
}

/* ----------------------------------------------------- relationships */

/** One deterministic "these belong together" rule. */
interface RelationRule {
  id: string;
  primary: RegExp;
  partner: RegExp;
}

/**
 * Rules are matched in order and both directions. Kept small and explicit:
 * a relationship the planner cannot justify physically is not a relationship.
 */
export const RELATION_RULES: RelationRule[] = [
  { id: "tv", primary: /\b(tv|television|flat[- ]?screen)\b/i, partner: /\btv\b.*\b(stand|unit|cabinet|bench|console)\b|\b(stand|unit|cabinet|bench|console)\b.*\btv\b|media unit/i },
  { id: "monitor", primary: /\bmonitor\b/i, partner: /\b(desk|table)\b/i },
  { id: "lamp", primary: /\blamp\b/i, partner: /\b(table|desk|sideboard|shelf)\b/i },
  { id: "electronics", primary: /\b(console|router|speaker|set[- ]?top|dvd|blu[- ]?ray|games? console)\b/i, partner: /\b(tv stand|media unit|shelf|cabinet|table)\b/i },
];

/** True when these two canonical items are deterministically related. */
export function areRelated(a: PlanningItem, b: PlanningItem): boolean {
  if (a.id === b.id) return false;
  for (const rule of RELATION_RULES) {
    const forward = rule.primary.test(a.label) && rule.partner.test(b.label);
    const backward = rule.primary.test(b.label) && rule.partner.test(a.label);
    if (forward || backward) return true;
  }
  return false;
}

/**
 * A lookup of item id → the ids it is related to. Built once per plan so the
 * candidate scorer never re-runs the regular expressions per position.
 */
export function relationMap(items: PlanningItem[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const item of items) map.set(item.id, new Set());
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!;
      const b = items[j]!;
      if (!areRelated(a, b)) continue;
      map.get(a.id)!.add(b.id);
      map.get(b.id)!.add(a.id);
    }
  }
  return map;
}

/* -------------------------------------------------- support surfaces */

/** Objects whose top face is a usable surface. */
const SURFACE = /stand|table|desk|shelf|cabinet|sideboard|console|bench|drawer|unit|box|crate|tote|carton|container|suitcase|case\b|trunk/i;

/** Heaviest thing a class of base may carry, as a share of its own footprint. */
export const MAX_SUPPORTED_FOOTPRINT_SHARE = 0.9;
/** Nothing is ever placed on a surface higher than this, in metres. */
export const MAX_SUPPORT_BASE_HEIGHT_M = 1.4;

const WEIGHT_RANK = { light: 0, medium: 1, heavy: 2 } as const;

/** Can `top` physically and safely rest on `base`? Purely geometric. */
export function canSupport(
  base: { item: PlanningItem; w: number; d: number; topHeightM: number },
  top: { item: PlanningItem; w: number; d: number; heightM: number },
  ceilingM: number,
): boolean {
  if (base.item.id === top.item.id) return false;
  if (base.item.fragile) return false;
  if (!SURFACE.test(base.item.label) && !base.item.stackable) return false;
  if (base.item.compressible) return false;
  if (base.topHeightM <= 0.05) return false;
  if (base.topHeightM > MAX_SUPPORT_BASE_HEIGHT_M) return false;
  if (base.topHeightM + top.heightM > ceilingM + 0.001) return false;
  // Never heavier than its base.
  if (WEIGHT_RANK[top.item.weight] > WEIGHT_RANK[base.item.weight]) return false;
  // Must sit fully within the supporting footprint.
  if (top.w > base.w * MAX_SUPPORTED_FOOTPRINT_SHARE + 0.001) return false;
  if (top.d > base.d * MAX_SUPPORTED_FOOTPRINT_SHARE + 0.001) return false;
  return true;
}

/**
 * Items that should be lifted off the floor whenever a surface exists: small
 * objects, and anything light enough that a floor footprint of its own is
 * simply wasted area.
 */
export function prefersSurface(item: PlanningItem): boolean {
  const cls = classifyItem(item);
  if (cls === "SMALL_ITEM") return true;
  const footprintM2 = (item.widthCm * item.depthCm) / 10_000;
  return item.weight === "light" && footprintM2 <= 0.25;
}
