/**
 * Phase 6E/6G — the physical placement engine.
 *
 * Deterministic, wall-first, corridor-preserving. Items are placed into
 * explicit storage bands carved around the access route, largest and heaviest
 * first, packed shoulder to shoulder against the wall, then compacted so no
 * unnecessary gap survives. That is what stops the scattered-across-the-floor
 * arrangements the earlier engine produced.
 *
 * Phase 6G adds the part that was missing: one pass is not trusted. Several
 * deterministic strategies are packed, each is validated, each is scored by the
 * arrangement-quality gate, and the best valid plan wins. Same inputs always
 * produce the same winner — no randomness anywhere.
 *
 * Nothing here asks an AI where things go.
 */
import { validateArrangement, walkwayIsClear } from "./constraints";
import { orientationsFor, placementOrder, stacksFor, type OrientationOption, type StackCandidate } from "./items";
import { arrangementQuality } from "./quality";
import { scoreArrangement } from "./score";
import {
  ACCESS_DEFAULTS,
  accessGeometry,
  contains,
  intersects,
  overlapArea,
  rectArea,
  usableStorageVolume,
} from "./space";
import type {
  ArrangementEntry,
  CorridorSide,
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

/**
 * One deterministic packing heuristic.
 *
 * Strategies differ only in the order they consider bands, items and
 * orientations. They never relax a physical constraint.
 */
export interface PackStrategy {
  id: string;
  label: string;
  bands: (bands: BandState[]) => BandState[];
  order: (a: StackCandidate, b: StackCandidate) => number;
  orientations: (options: OrientationOption[]) => OrientationOption[];
  /**
   * Phase 6Q: when true the strategy ignores bands and cursors entirely and
   * uses the deterministic candidate-search optimiser instead.
   */
  search?: boolean;
}

const byFootprintDesc = (a: StackCandidate, b: StackCandidate): number => {
  const areaA = a.item.widthCm * a.item.depthCm;
  const areaB = b.item.widthCm * b.item.depthCm;
  if (areaA !== areaB) return areaB - areaA;
  return a.item.id.localeCompare(b.item.id);
};

const byHeightDesc = (a: StackCandidate, b: StackCandidate): number => {
  if (a.item.heightCm !== b.item.heightCm) return b.item.heightCm - a.item.heightCm;
  return byFootprintDesc(a, b);
};

/** The four heuristics, always attempted in this order. */
export const PACK_STRATEGIES: PackStrategy[] = [
  {
    id: "wall-first",
    label: "Largest and heaviest against the walls",
    bands: (bands) => bands,
    order: placementOrder,
    orientations: (options) => options,
  },
  {
    id: "corner-first",
    label: "Corners filled before the long walls",
    // Narrow bands first: a corner or short return fills up before an open wall.
    bands: (bands) => [...bands].sort((a, b) => rectArea(a.rect) - rectArea(b.rect)),
    order: byFootprintDesc,
    orientations: (options) => options,
  },
  {
    id: "wall-vertical",
    label: "Wall packing with vertical stacking",
    bands: (bands) => bands,
    order: byHeightDesc,
    // Upright first: standing things on edge recovers the most floor.
    orientations: (options) =>
      [...options].sort((a, b) => {
        const rank = (option: OrientationOption) => (option.orientation === "upright" ? 0 : 1);
        return rank(a) - rank(b) || a.w * a.d - b.w * b.d;
      }),
  },
  {
    id: "compact-cluster",
    label: "One compact block",
    // Fill a single band to exhaustion before opening another one.
    bands: (bands) => [...bands].sort((a, b) => rectArea(b.rect) - rectArea(a.rect)),
    order: byFootprintDesc,
    orientations: (options) => options,
  },
  {
    id: "grouped-zones",
    label: "Related belongings kept in the same zone",
    // Fill the largest band first, but walk the items category by category so
    // boxes end up with boxes and furniture with furniture.
    bands: (bands) => [...bands].sort((a, b) => rectArea(b.rect) - rectArea(a.rect)),
    order: (a, b) => {
      const byCategory = (a.item.category ?? "").localeCompare(b.item.category ?? "");
      if (byCategory !== 0) return byCategory;
      return byFootprintDesc(a, b);
    },
    orientations: (options) => options,
  },
];


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
  strategy?: PackStrategy;
}

/**
 * Plan the arrangement with one strategy.
 *
 * Priority order is the product brief's: fit everything, keep access, respect
 * dimensions and orientation, avoid collisions, use height, heavy items low,
 * group what belongs together, and waste as little floor as possible.
 */
export function arrangeItems(
  items: PlanningItem[],
  space: PlanningSpace,
  options: ArrangeOptions = {},
): PhysicalArrangement {
  const strategy = options.strategy ?? PACK_STRATEGIES[0]!;
  const ceiling = Math.min(space.heightM, ACCESS_DEFAULTS.maxStackHeightM);
  const geometry = accessGeometry(space);
  const blockers: Rect[] = [...geometry.keepClear];

  const bands: BandState[] = strategy.bands(
    geometry.bands.map((band) => ({
      id: band.id,
      rect: band.rect,
      zone: band.zone,
      x: band.rect.x,
      y: band.rect.y,
      rowDepth: 0,
    })),
  );

  // Wall-mounted objects never compete for floor: they are hung, not packed.
  const floorItems = items.filter((item) => !item.wallMounted);
  const mountedItems = items.filter((item) => item.wallMounted);

  const entries: ArrangementEntry[] = [];
  const unplacedUnits = new Map<string, number>();
  const placedFloor: Rect[] = [];
  let key = 0;

  if (strategy.search) {
    // Phase 6Q: deterministic candidate-search optimisation, not first fit.
    entries.push(
      ...searchPlacements({ items: floorItems, space, ceiling, blockers, unplacedUnits }),
    );
    key = entries.length;
  } else {
    const stacks = stacksFor(floorItems, ceiling).sort(strategy.order);
    for (const stack of stacks) {
      const placed = placeStack(stack, bands, blockers, placedFloor, space, ceiling, key, strategy);
      if (placed) {
        entries.push(placed);
        placedFloor.push({ x: placed.x, y: placed.y, w: placed.w, d: placed.d });
        key += 1;
      } else {
        unplacedUnits.set(stack.item.id, (unplacedUnits.get(stack.item.id) ?? 0) + stack.units);
      }
    }
  }

  // Close every gap the row cursor left behind, then lift fragile items clear.
  // The search engine has already optimised positions, so it is not re-slid.
  const compacted = strategy.search ? entries : compactEntries(entries, space, blockers);
  const mounted = mountWallItems(mountedItems, space, ceiling, key, unplacedUnits);
  const lifted = [...protectFragile(compacted, ceiling), ...mounted];

  // Deterministic repair: an entry that breaks a hard constraint is removed
  // and reported as unplaced. An invalid placement is never kept, and never
  // left for the renderer to disguise.
  let accepted = lifted;
  let validation = validateArrangement({ space, items, entries: accepted, unplacedUnits });
  for (let attempt = 0; attempt < 3 && !validation.valid; attempt += 1) {
    const offending = new Set(
      validation.violations
        .filter((violation) => violation.code !== "missing_item" && violation.itemId)
        .map((violation) => violation.itemId!),
    );
    if (offending.size === 0) break;
    const kept = accepted.filter((entry) => !offending.has(entry.itemId));
    if (kept.length === accepted.length) break;
    for (const entry of accepted) {
      if (offending.has(entry.itemId)) {
        unplacedUnits.set(entry.itemId, (unplacedUnits.get(entry.itemId) ?? 0) + entry.units);
      }
    }
    accepted = kept.map((entry) => ({
      ...entry,
      supportsItemIds: entry.supportsItemIds.filter((id) => !offending.has(id)),
    }));
    validation = validateArrangement({ space, items, entries: accepted, unplacedUnits });
  }

  const unplaced: UnplacedItem[] = [...unplacedUnits.entries()]
    .filter(([, units]) => units > 0)
    .map(([itemId, units]) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return {
        itemId,
        label: item?.label ?? itemId,
        units,
        reason: item?.wallMounted
          ? "No clear wall run remained for a wall-mounted object."
          : "No space remained inside the usable area while keeping the access route clear.",
      };
    });

  const { valid, violations } = validation;

  const usableVolumeM3 = usableStorageVolume(space);

  const occupiedVolumeM3 = round2(
    accepted.reduce((sum, entry) => sum + entry.w * entry.d * entry.heightM, 0),
  );
  const occupiedFloorM2 = round2(
    accepted.filter((entry) => entry.layer === 0).reduce((sum, entry) => sum + entry.w * entry.d, 0),
  );
  const placedUnits = accepted.reduce((sum, entry) => sum + entry.units, 0);
  const expectedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const walkwayClear = walkwayIsClear(space, accepted);

  const excludedFloorM2 = round2(
    space.obstacles.reduce((sum, obstacle) => sum + overlapArea(space.usable, obstacle), 0),
  );

  const score = scoreArrangement({
    space,
    entries: accepted,
    violations,
    placedUnits,
    expectedUnits,
    walkwayClear,
    occupiedVolumeM3,
    usableVolumeM3,
  });

  const planValid = valid && walkwayClear;

  return {
    space,
    entries: accepted,
    unplaced,
    walkway: walkwayClear ? geometry.walkway : null,
    occupiedFloorM2,
    occupiedVolumeM3,
    usableFloorM2: round2(rectArea(space.usable)),
    usableVolumeM3,
    excludedFloorM2,
    walkwayFloorM2: round2(geometry.walkway ? rectArea(geometry.walkway) : 0),
    corridorSide: space.corridorSide ?? "centre",
    utilisationPercent:
      usableVolumeM3 > 0 ? Math.min(100, Math.round((occupiedVolumeM3 / usableVolumeM3) * 100)) : 0,
    placedUnits,
    expectedUnits,
    valid: planValid,
    violations,
    score,
    strategy: strategy.id,
    quality: arrangementQuality({
      space,
      entries: accepted,
      wallUse: score.wallUse,
      compactness: score.compactness,
      verticalUse: score.verticalUse,
      grouping: score.grouping,
      valid: planValid,
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
  strategy: PackStrategy,
): ArrangementEntry | null {
  const options = strategy.orientations(orientationsFor(stack.item, ceiling));
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
        mounted: false,
        groupId: stack.groupId,
        fragile: stack.item.fragile,
        weight: stack.item.weight,
        confidence: stack.item.confidence,
      };
    }
  }

  return null;
}

const WALL_MOUNT_DEPTH_M = 0.15;
const WALL_MOUNT_BASE_M = 1;

/**
 * Wall-mounted objects: hung along the rear wall run, left to right, above
 * the floor. They take no floor area, they are never stacked on, and they are
 * never represented as floor-standing. A wall run that has no clear width left
 * reports the object as unplaced rather than laying it on the ground.
 */
function mountWallItems(
  items: PlanningItem[],
  space: PlanningSpace,
  ceiling: number,
  startKey: number,
  unplacedUnits: Map<string, number>,
): ArrangementEntry[] {
  if (items.length === 0) return [];
  const usable = space.usable;
  const out: ArrangementEntry[] = [];
  let cursorX = usable.x;
  let key = startKey;

  for (const item of items) {
    for (let unit = 0; unit < item.quantity; unit += 1) {
      const w = round2(Math.round(item.widthCm) / 100);
      const h = round2(Math.round(item.heightCm) / 100);
      const d = round2(Math.min(WALL_MOUNT_DEPTH_M, Math.round(item.depthCm) / 100));
      const base = round2(Math.max(0.3, Math.min(WALL_MOUNT_BASE_M, ceiling - h)));
      const fits =
        w <= usable.w + 0.001 &&
        cursorX + w <= usable.x + usable.w + 0.001 &&
        base + h <= ceiling + 0.001;
      if (!fits) {
        unplacedUnits.set(item.id, (unplacedUnits.get(item.id) ?? 0) + 1);
        continue;
      }
      out.push({
        key: `mount-${key}-${item.id}`,
        itemId: item.id,
        label: item.label,
        units: 1,
        x: round2(cursorX),
        y: round2(usable.y),
        w,
        d,
        heightM: h,
        baseHeightM: base,
        layer: 1,
        rotationDeg: 0,
        orientation: "upright",
        zone: "back-wall",
        supportsItemIds: [],
        supportedBy: "wall",
        groupId: `group-${item.id}`,
        fragile: item.fragile,
        weight: item.weight,
        confidence: item.confidence,
        mounted: true,
      });
      cursorX = round2(cursorX + w + 0.05);
      key += 1;
    }
  }

  return out;
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

const STEP_M = 0.02;

/**
 * Gravity towards the walls.
 *
 * Each footprint is slid as far as it will go towards its own wall, then along
 * that wall towards the items already placed, stopping the moment it would
 * touch anything or leave the usable area. This is what turns "technically
 * valid" into "shoulder to shoulder", and it is what removes the gaps that
 * made earlier renders read as scattered.
 */
export function compactEntries(
  entries: ArrangementEntry[],
  space: PlanningSpace,
  blockers: Rect[],
): ArrangementEntry[] {
  const settled: ArrangementEntry[] = [];
  const usable = space.usable;

  const free = (rect: Rect, self: string): boolean => {
    if (!contains(usable, rect)) return false;
    if (blockers.some((blocker) => intersects(rect, blocker))) return false;
    return !settled.some((other) => other.key !== self && other.layer === 0 && intersects(rect, other));
  };

  const slide = (entry: ArrangementEntry, dx: number, dy: number): ArrangementEntry => {
    let current = { ...entry };
    for (let step = 0; step < 400; step += 1) {
      const next: Rect = {
        x: round2(current.x + dx * STEP_M),
        y: round2(current.y + dy * STEP_M),
        w: current.w,
        d: current.d,
      };
      if (!free(next, entry.key)) break;
      current = { ...current, x: next.x, y: next.y };
    }
    return current;
  };

  // Deterministic: settle in the order the packer produced.
  for (const entry of entries) {
    if (entry.layer > 0) {
      settled.push(entry);
      continue;
    }

    // Towards its wall first.
    const towardsWall: [number, number] =
      entry.zone === "right-wall" ? [1, 0] : entry.zone === "left-wall" ? [-1, 0] : [0, -1];
    let placed = slide(entry, towardsWall[0], towardsWall[1]);
    // Then along the wall, back towards the rear of the space, closing gaps.
    const alongWall: [number, number] = towardsWall[0] === 0 ? [-1, 0] : [0, -1];
    placed = slide(placed, alongWall[0], alongWall[1]);
    settled.push(placed);
  }

  return settled;
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

/** Ranks two valid plans. Completeness, then access, then arrangement quality. */
function betterPlan(candidate: PhysicalArrangement, incumbent: PhysicalArrangement): boolean {
  if (candidate.valid !== incumbent.valid) return candidate.valid;
  if (candidate.unplaced.length !== incumbent.unplaced.length)
    return candidate.unplaced.length < incumbent.unplaced.length;
  if (candidate.quality.score !== incumbent.quality.score)
    return candidate.quality.score > incumbent.quality.score;
  return candidate.score.total > incumbent.score.total;
}

/**
 * The plan the product actually uses.
 *
 * Every strategy is packed with the preferred corridor. If none clears the
 * quality gate with everything placed, the corridor is tightened to the
 * physical minimum and the strategies are tried again — access is priority 2,
 * so the wider corridor always wins when both plans are equally complete.
 *
 * Deterministic: identical inputs always yield the identical winning plan.
 */
export function bestArrangement(
  items: PlanningItem[],
  space: PlanningSpace,
): PhysicalArrangement {
  const clearances = [space.walkwayClearanceM];
  const tighter = Math.max(ACCESS_DEFAULTS.minWalkwayM, space.walkwayClearanceM - 0.3);
  if (tighter < space.walkwayClearanceM - 0.001) clearances.push(tighter);

  // Corridor variants matter more than the packing heuristic: a corridor down
  // one side leaves a single contiguous block of belongings, which is exactly
  // what the scattered results were missing.
  const sides: CorridorSide[] = space.corridorSide
    ? [space.corridorSide]
    : ["left", "right", "centre"];

  let best: PhysicalArrangement | null = null;

  for (const walkwayClearanceM of clearances) {
    for (const corridorSide of sides) {
      const candidateSpace: PlanningSpace = { ...space, walkwayClearanceM, corridorSide };
      for (const strategy of PACK_STRATEGIES) {
        const plan = arrangeItems(items, candidateSpace, { strategy });
        if (!best || betterPlan(plan, best)) best = plan;
        // An excellent plan needs no more searching; a merely passing one is
        // kept but still compared against the remaining variants.
        if (plan.valid && plan.unplaced.length === 0 && plan.quality.score >= 90) return plan;
      }
    }
    // Only widen the search to a tighter corridor when the preferred one failed
    // to place everything.
    const settled: PhysicalArrangement | null = best;
    if (settled && settled.valid && settled.unplaced.length === 0) return settled;
  }

  return best ?? arrangeItems(items, space);
}

