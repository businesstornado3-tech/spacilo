/**
 * Phase 6E — plan scoring, including the anti-scatter penalty.
 *
 * Scoring never rescues an invalid plan: hard-constraint violations are
 * decided in `constraints.ts` and no score can overturn them. This is only
 * used to choose between plans that are all physically valid.
 */
import { overlapArea, rectArea } from "./space";
import type { ArrangementEntry, ArrangementScore, PlanningSpace, Rect, Violation } from "./types";

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Share of placed footprints that touch a wall or the edge of the usable area. */
export function wallContactRatio(space: PlanningSpace, entries: ArrangementEntry[]): number {
  const floor = entries.filter((entry) => entry.layer === 0);
  if (floor.length === 0) return 1;
  const usable = space.usable;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.15;
  const touching = floor.filter(
    (entry) =>
      near(entry.x, usable.x) ||
      near(entry.x + entry.w, usable.x + usable.w) ||
      near(entry.y, usable.y) ||
      near(entry.y + entry.d, usable.y + usable.d),
  );
  return touching.length / floor.length;
}

/** Occupied floor ÷ the bounding box the arrangement spreads over. */
export function compactness(entries: ArrangementEntry[]): number {
  const floor = entries.filter((entry) => entry.layer === 0);
  if (floor.length === 0) return 1;
  const minX = Math.min(...floor.map((entry) => entry.x));
  const minY = Math.min(...floor.map((entry) => entry.y));
  const maxX = Math.max(...floor.map((entry) => entry.x + entry.w));
  const maxY = Math.max(...floor.map((entry) => entry.y + entry.d));
  const hull = Math.max(0.01, (maxX - minX) * (maxY - minY));
  const used = floor.reduce((sum, entry) => sum + entry.w * entry.d, 0);
  return Math.max(0, Math.min(1, used / hull));
}

/** How well units of the same item stayed together. */
export function groupingRatio(entries: ArrangementEntry[]): number {
  const groups = new Map<string, ArrangementEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.groupId) ?? [];
    list.push(entry);
    groups.set(entry.groupId, list);
  }
  const multi = [...groups.values()].filter((list) => list.length > 1);
  if (multi.length === 0) return 1;
  const adjacent = multi.filter((list) =>
    list.every((entry, index) => {
      if (index === 0) return true;
      const previous = list[index - 1]!;
      const gapX = Math.max(0, Math.max(entry.x, previous.x) - Math.min(entry.x + entry.w, previous.x + previous.w));
      const gapY = Math.max(0, Math.max(entry.y, previous.y) - Math.min(entry.y + entry.d, previous.y + previous.d));
      return gapX <= 0.35 && gapY <= 0.35;
    }),
  );
  return adjacent.length / multi.length;
}

/** Placed footprints that sit in open floor without touching anything. */
export function scatteredCount(space: PlanningSpace, entries: ArrangementEntry[]): number {
  const floor = entries.filter((entry) => entry.layer === 0);
  const usable = space.usable;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.15;
  return floor.filter((entry) => {
    const onWall =
      near(entry.x, usable.x) ||
      near(entry.x + entry.w, usable.x + usable.w) ||
      near(entry.y, usable.y) ||
      near(entry.y + entry.d, usable.y + usable.d);
    if (onWall) return false;
    const grown: Rect = { x: entry.x - 0.2, y: entry.y - 0.2, w: entry.w + 0.4, d: entry.d + 0.4 };
    const neighbour = floor.some((other) => other.key !== entry.key && overlapArea(grown, other) > 0);
    return !neighbour;
  }).length;
}

export function scoreArrangement({
  space,
  entries,
  violations,
  placedUnits,
  expectedUnits,
  walkwayClear,
  occupiedVolumeM3,
  usableVolumeM3,
}: {
  space: PlanningSpace;
  entries: ArrangementEntry[];
  violations: Violation[];
  placedUnits: number;
  expectedUnits: number;
  walkwayClear: boolean;
  occupiedVolumeM3: number;
  usableVolumeM3: number;
}): ArrangementScore {
  const completeness = expectedUnits > 0 ? pct((placedUnits / expectedUnits) * 100) : 0;
  const access = walkwayClear ? 100 : 0;
  const compact = pct(compactness(entries) * 100);
  const wall = pct(wallContactRatio(space, entries) * 100);
  const stacked = entries.filter((entry) => entry.units > 1 || entry.layer > 0).length;
  const vertical = entries.length > 0 ? pct((stacked / entries.length) * 100) : 0;
  const grouping = pct(groupingRatio(entries) * 100);

  const wastedFloor = (() => {
    const bandArea = rectArea(space.usable);
    if (bandArea <= 0) return 0;
    const used = entries
      .filter((entry) => entry.layer === 0)
      .reduce((sum, entry) => sum + entry.w * entry.d, 0);
    const capacityShare = usableVolumeM3 > 0 ? occupiedVolumeM3 / usableVolumeM3 : 0;
    // Only penalise unused floor when there is still stuff waiting to go in.
    return placedUnits < expectedUnits ? pct((1 - used / bandArea) * 100) * (1 - capacityShare) : 0;
  })();

  const penalties =
    violations.length * 40 + scatteredCount(space, entries) * 12 + Math.round(wastedFloor * 0.2);

  const total = Math.max(
    0,
    Math.round(
      completeness * 0.3 +
        access * 0.2 +
        compact * 0.15 +
        wall * 0.15 +
        vertical * 0.08 +
        grouping * 0.12 -
        penalties,
    ),
  );

  return { total, completeness, access, compactness: compact, wallUse: wall, verticalUse: vertical, grouping, penalties };
}
