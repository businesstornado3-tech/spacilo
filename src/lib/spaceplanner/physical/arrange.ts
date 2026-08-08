/**
 * Phase 6E — the physical placement engine.
 *
 * Deterministic, wall-first, corridor-preserving. Items are placed into
 * explicit storage bands carved around the access route, largest and heaviest
 * first, packed shoulder to shoulder against the wall. That is what stops the
 * scattered-across-the-floor arrangements the previous engine produced.
 *
 * Nothing here asks an AI where things go.
 */
import { validateArrangement, walkwayIsClear } from "./constraints";
import { orientationsFor, placementOrder, stacksFor, type OrientationOption, type StackCandidate } from "./items";
import { scoreArrangement } from "./score";
import {
  ACCESS_DEFAULTS,
  accessGeometry,
  intersects,
  overlapArea,
  rectArea,
  usableStorageVolume,
} from "./space";
import type {
  ArrangementEntry,
  PhysicalArrangement,
  PlacementZone,
  PlanningItem,
  PlanningSpace,
  Rect,
  UnplacedItem,
} from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

interface BandState {
  id: string;
  rect: Rect;
  zone: PlacementZone;
  /** Row cursor, measured from the band's back edge. */
  x: number;
  y: number;
  rowDepth: number;
}

function isCorner(band: BandState, x: number, space: PlanningSpace): boolean {
  const usable = space.usable;
  const atBack = Math.abs(band.rect.y - usable.y) < 0.01;
  const atEdge = Math.abs(x - usable.x) < 0.15 || Math.abs(x - (usable.x + usable.w)) < 0.35;
  return atBack && atEdge;
}

/** Advance the cursor past anything that must stay clear. */
function firstFreeX(band: BandState, candidate: Rect, blockers: Rect[]): number | null {
  let x = candidate.x;
  let guard = 0;
  while (guard < 64) {
    guard += 1;
    const test: Rect = { ...candidate, x };
    if (x + candidate.w > band.rect.x + band.rect.w + 0.001) return null;
    const hit = blockers.find((blocker) => intersects(test, blocker));
    if (!hit) return x;
    x = round2(hit.x + hit.w + 0.02);
  }
  return null;
}

export interface ArrangeOptions {
  /** Only ever used to keep the engine deterministic in tests. */
  now?: number;
}

/**
 * Plan the arrangement.
 *
 * Priority order is the product brief's: fit everything, keep access, respect
 * dimensions and orientation, avoid collisions, use height, heavy items low,
 * group what belongs together, and waste as little floor as possible.
 */
export function arrangeItems(
  items: PlanningItem[],
  space: PlanningSpace,
): PhysicalArrangement {
  const ceiling = Math.min(space.heightM, ACCESS_DEFAULTS.maxStackHeightM);
  const geometry = accessGeometry(space);
  const blockers: Rect[] = [...geometry.keepClear];

  const bands: BandState[] = geometry.bands.map((band) => ({
    id: band.id,
    rect: band.rect,
    zone: band.zone,
    x: band.rect.x,
    y: band.rect.y,
    rowDepth: 0,
  }));

  const stacks = stacksFor(items, ceiling).sort(placementOrder);
  const entries: ArrangementEntry[] = [];
  const unplacedUnits = new Map<string, number>();
  const placedFloor: Rect[] = [];
  let key = 0;

  for (const stack of stacks) {
    const placed = placeStack(stack, bands, blockers, placedFloor, space, ceiling, key);
    if (placed) {
      entries.push(placed);
      placedFloor.push({ x: placed.x, y: placed.y, w: placed.w, d: placed.d });
      key += 1;
    } else {
      unplacedUnits.set(stack.item.id, (unplacedUnits.get(stack.item.id) ?? 0) + stack.units);
    }
  }

  // Fragile items must never end up under something heavy: lift them onto a
  // larger, sturdier neighbour when one exists.
  const lifted = protectFragile(entries, ceiling);

  const unplaced: UnplacedItem[] = [...unplacedUnits.entries()].map(([itemId, units]) => {
    const item = items.find((candidate) => candidate.id === itemId);
    return {
      itemId,
      label: item?.label ?? itemId,
      units,
      reason: "No space remained inside the usable area while keeping the access route clear.",
    };
  });

  const { valid, violations } = validateArrangement({
    space,
    items,
    entries: lifted,
    unplacedUnits,
  });

  const usableVolumeM3 = usableStorageVolume(space);
  const occupiedVolumeM3 = round2(
    lifted.reduce((sum, entry) => sum + entry.w * entry.d * entry.heightM, 0),
  );
  const occupiedFloorM2 = round2(
    lifted.filter((entry) => entry.layer === 0).reduce((sum, entry) => sum + entry.w * entry.d, 0),
  );
  const placedUnits = lifted.reduce((sum, entry) => sum + entry.units, 0);
  const expectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const walkwayClear = walkwayIsClear(space, lifted);

  const excludedFloorM2 = round2(
    space.obstacles.reduce((sum, obstacle) => sum + overlapArea(space.usable, obstacle), 0),
  );

  return {
    space,
    entries: lifted,
    unplaced,
    walkway: walkwayClear ? geometry.walkway : null,
    occupiedFloorM2,
    occupiedVolumeM3,
    usableFloorM2: round2(rectArea(space.usable)),
    usableVolumeM3,
    excludedFloorM2,
    walkwayFloorM2: round2(geometry.walkway ? rectArea(geometry.walkway) : 0),
    utilisationPercent:
      usableVolumeM3 > 0 ? Math.min(100, Math.round((occupiedVolumeM3 / usableVolumeM3) * 100)) : 0,
    placedUnits,
    expectedUnits,
    valid: valid && walkwayClear,
    violations,
    score: scoreArrangement({
      space,
      entries: lifted,
      violations,
      placedUnits,
      expectedUnits,
      walkwayClear,
      occupiedVolumeM3,
      usableVolumeM3,
    }),
  };
}

function placeStack(
  stack: StackCandidate,
  bands: BandState[],
  blockers: Rect[],
  placedFloor: Rect[],
  space: PlanningSpace,
  ceiling: number,
  key: number,
): ArrangementEntry | null {
  const options = orientationsFor(stack.item, ceiling);
  if (options.length === 0) return null;

  const unitHeight = Math.max(0.05, Math.round(stack.item.heightCm) / 100);

  for (const band of bands) {
    for (const option of options) {
      const stackHeight = stackedHeight(option, stack.units, unitHeight);
      if (stackHeight > ceiling + 0.001) continue;
      if (option.w > band.rect.w + 0.001 || option.d > band.rect.d + 0.001) continue;

      const spot = findSpot(band, option, blockers, placedFloor);
      if (!spot) continue;

      band.x = round2(spot.x + option.w);
      band.y = spot.y;
      band.rowDepth = Math.max(band.rowDepth, option.d);

      return {
        key: `place-${key}-${stack.item.id}`,
        itemId: stack.item.id,
        label: stack.item.label,
        units: stack.units,
        x: round2(spot.x),
        y: round2(spot.y),
        w: round2(option.w),
        d: round2(option.d),
        heightM: round2(stackHeight),
        baseHeightM: 0,
        layer: 0,
        rotationDeg: option.rotationDeg,
        orientation: option.orientation,
        zone: isCorner(band, spot.x, space) ? "corner" : band.zone,
        supportsItemIds: [],
        supportedBy: null,
        groupId: stack.groupId,
        fragile: stack.item.fragile,
        weight: stack.item.weight,
        confidence: stack.item.confidence,
      };
    }
  }

  return null;
}

function stackedHeight(option: OrientationOption, units: number, unitHeight: number): number {
  if (units <= 1) return option.h;
  // A stack repeats the item's own height, whatever footprint it stands on.
  return option.orientation === "upright" ? option.h : unitHeight * units;
}

/** Shoulder-to-shoulder rows inside one band, wall side first. */
function findSpot(
  band: BandState,
  option: OrientationOption,
  blockers: Rect[],
  placedFloor: Rect[],
): { x: number; y: number } | null {
  const all = [...blockers, ...placedFloor];
  let cursorX = band.x;
  let cursorY = band.y;
  let rowDepth = band.rowDepth;

  for (let row = 0; row < 32; row += 1) {
    if (cursorY + option.d > band.rect.y + band.rect.d + 0.001) return null;
    const candidate: Rect = { x: cursorX, y: cursorY, w: option.w, d: option.d };
    const x = firstFreeX({ ...band, x: cursorX, y: cursorY, rowDepth }, candidate, all);
    if (x !== null) {
      band.x = x;
      band.y = cursorY;
      band.rowDepth = rowDepth;
      return { x, y: cursorY };
    }
    // Next row, further from the wall.
    cursorY = round2(cursorY + Math.max(rowDepth, option.d));
    cursorX = band.rect.x;
    rowDepth = 0;
  }
  return null;
}

/**
 * Fragile items are lifted onto a larger, non-fragile, floor-standing
 * neighbour so nothing heavy can ever be put on top of them. Nothing is
 * lifted onto a base that cannot physically carry it.
 */
function protectFragile(entries: ArrangementEntry[], ceiling: number): ArrangementEntry[] {
  const taken = new Set<string>();
  return entries.map((entry) => {
    if (!entry.fragile || entry.layer > 0) return entry;
    const base = entries.find(
      (candidate) =>
        candidate.key !== entry.key &&
        !candidate.fragile &&
        candidate.layer === 0 &&
        !taken.has(candidate.key) &&
        candidate.w >= entry.w - 0.001 &&
        candidate.d >= entry.d - 0.001 &&
        candidate.weight !== "light" &&
        candidate.heightM + entry.heightM <= ceiling + 0.001,
    );
    if (!base) return entry;
    taken.add(base.key);
    base.supportsItemIds.push(entry.itemId);
    return {
      ...entry,
      x: base.x,
      y: base.y,
      layer: 1,
      baseHeightM: base.heightM,
      supportedBy: base.itemId,
      zone: base.zone,
    };
  });
}

/**
 * Try the plan, then try it again with a tighter corridor if not everything
 * fits. The wider corridor always wins when both plans are complete: access is
 * priority 2, immediately after fitting the inventory.
 */
export function bestArrangement(
  items: PlanningItem[],
  space: PlanningSpace,
): PhysicalArrangement {
  const first = arrangeItems(items, space);
  if (first.valid && first.unplaced.length === 0) return first;

  const tighter = Math.max(ACCESS_DEFAULTS.minWalkwayM, space.walkwayClearanceM - 0.3);
  if (tighter >= space.walkwayClearanceM - 0.001) return first;

  const second = arrangeItems(items, { ...space, walkwayClearanceM: tighter });
  if (second.unplaced.length < first.unplaced.length && second.valid) return second;
  return second.valid && !first.valid ? second : first;
}
