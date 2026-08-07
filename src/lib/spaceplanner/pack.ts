/**
 * Deterministic packing.
 *
 * Two passes over the same inventory:
 *   `packNaive`     — how a space fills up when things go in as they arrive.
 *   `packOptimised` — what SpacePlanner™ proposes: rotation, safe stacking,
 *                     heavy low, fragile high, frequently-used near the door,
 *                     and a preserved walkway.
 *
 * The result is a plan-view geometry the UI animates between. Coordinates are
 * metres from the back-left corner; y grows towards the door.
 */
import type { InventoryLine, PackResult, Placement, StorageSpace, Zone } from "./types";
import { MAX_STACK_HEIGHT_M, walkwayDepth } from "./spaces";

interface Footprint {
  itemId: string;
  label: string;
  icon: Placement["icon"];
  w: number;
  d: number;
  height: number;
  units: number;
  rotated: boolean;
  upright: boolean;
  fragile: boolean;
  stackable: boolean;
  weight: Placement["weight"];
  frequentlyUsed: boolean;
}

const cm = (value: number) => Math.round(value) / 100;

function zoneFor(y: number, d: number, usableDepth: number): Zone {
  const centre = y + d / 2;
  if (centre < usableDepth / 3) return "back";
  if (centre < (usableDepth * 2) / 3) return "middle";
  return "front";
}

/** Footprint when the item lies the way it normally sits in a home. */
function flatFootprint(line: InventoryLine): { w: number; d: number; height: number } {
  const { item } = line;
  return { w: cm(item.width), d: cm(item.depth), height: cm(item.height) };
}

/** Footprint when the item is stood on its edge to reclaim floor area. */
function uprightFootprint(line: InventoryLine): { w: number; d: number; height: number } | null {
  const { item } = line;
  if (!item.standsUpright) return null;
  const dims = [item.width, item.depth, item.height].sort((a, b) => b - a);
  const [longest, middle, shortest] = dims as [number, number, number];
  const height = cm(middle);
  if (height > MAX_STACK_HEIGHT_M) return null;
  return { w: cm(longest), d: cm(shortest), height };
}

function stackHeightLimit(space: StorageSpace): number {
  return Math.min(space.height, MAX_STACK_HEIGHT_M);
}

/** Expands inventory lines into the footprints that actually go on the floor. */
function toFootprints(lines: InventoryLine[], space: StorageSpace, optimise: boolean): Footprint[] {
  const limit = stackHeightLimit(space);
  const out: Footprint[] = [];

  for (const line of lines) {
    const { item } = line;
    const flat = flatFootprint(line);
    const upright = optimise ? uprightFootprint(line) : null;
    const useUpright = Boolean(upright && upright.w * upright.d < flat.w * flat.d);
    const shape = useUpright && upright ? upright : flat;

    const perStack =
      optimise && item.stackable
        ? Math.max(1, Math.min(item.maxStack, Math.floor(limit / Math.max(shape.height, 0.01))))
        : 1;

    let remaining = line.quantity;
    while (remaining > 0) {
      const units = Math.min(perStack, remaining);
      remaining -= units;
      out.push({
        itemId: item.id,
        label: item.name,
        icon: item.icon,
        w: shape.w,
        d: shape.d,
        height: shape.height,
        units,
        rotated: useUpright,
        upright: useUpright,
        fragile: item.fragile,
        stackable: item.stackable,
        weight: item.weight,
        frequentlyUsed: item.frequentlyUsed,
      });
    }
  }

  return out;
}

/**
 * Placement order for the optimised plan: heavy and bulky against the back
 * wall, everyday items last so they end up nearest the door.
 */
function optimisedOrder(a: Footprint, b: Footprint): number {
  const rank = (f: Footprint) => {
    if (f.frequentlyUsed) return 2;
    if (f.weight === "heavy") return 0;
    return 1;
  };
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  const byArea = b.w * b.d - a.w * a.d;
  if (byArea !== 0) return byArea;
  return a.itemId.localeCompare(b.itemId);
}

interface RowState {
  x: number;
  y: number;
  rowDepth: number;
}

function place(
  footprints: Footprint[],
  space: StorageSpace,
  usableDepth: number,
  allowRotation: boolean,
): { placements: Placement[]; unplaced: string[] } {
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  const row: RowState = { x: 0, y: 0, rowDepth: 0 };
  let index = 0;

  for (const f of footprints) {
    let w = f.w;
    let d = f.d;
    let rotated = f.rotated;

    // Turning an item across the row is the cheapest way to reclaim width.
    if (allowRotation && w > space.width && d <= space.width) {
      [w, d] = [d, w];
      rotated = true;
    }
    if (allowRotation && row.x + w > space.width && row.x + d <= space.width && d !== w) {
      [w, d] = [d, w];
      rotated = true;
    }

    if (w > space.width || d > usableDepth) {
      unplaced.push(f.itemId);
      continue;
    }

    if (row.x + w > space.width + 0.001) {
      row.y += row.rowDepth;
      row.x = 0;
      row.rowDepth = 0;
    }

    if (row.y + d > usableDepth + 0.001) {
      unplaced.push(f.itemId);
      continue;
    }

    placements.push({
      key: `${f.itemId}-${index++}`,
      itemId: f.itemId,
      label: f.label,
      icon: f.icon,
      x: Math.round(row.x * 100) / 100,
      y: Math.round(row.y * 100) / 100,
      w: Math.round(w * 100) / 100,
      d: Math.round(d * 100) / 100,
      level: 0,
      units: f.units,
      rotated,
      upright: f.upright,
      fragile: f.fragile,
      weight: f.weight,
      zone: zoneFor(row.y, d, usableDepth),
    });

    row.x += w;
    row.rowDepth = Math.max(row.rowDepth, d);
  }

  return { placements, unplaced };
}

/**
 * Lifts fragile floor items onto a solid base so nothing heavy can be put on
 * top of them later. Only ever stacks onto a larger, non-fragile footprint.
 */
function protectFragile(placements: Placement[]): Placement[] {
  const bases = placements.filter((p) => !p.fragile && p.level === 0);
  const taken = new Set<string>();

  return placements.map((p) => {
    if (!p.fragile || p.level > 0) return p;
    const base = bases.find(
      (b) => !taken.has(b.key) && b.w >= p.w - 0.001 && b.d >= p.d - 0.001 && b.key !== p.key,
    );
    if (!base) return p;
    taken.add(base.key);
    return { ...p, x: base.x, y: base.y, level: 1, zone: base.zone };
  });
}

function floorArea(placements: Placement[]): number {
  return (
    Math.round(
      placements.filter((p) => p.level === 0).reduce((sum, p) => sum + p.w * p.d, 0) * 100,
    ) / 100
  );
}

/** Everything goes in as it arrives: no rotation, no stacking, no walkway. */
export function packNaive(lines: InventoryLine[], space: StorageSpace): PackResult {
  const footprints = toFootprints(lines, space, false);
  const { placements, unplaced } = place(footprints, space, space.depth, false);
  return {
    placements,
    walkway: null,
    unplaced,
    floorAreaUsed: floorArea(placements),
    stackedUnits: 0,
  };
}

/** The SpacePlanner™ proposal. */
export function packOptimised(lines: InventoryLine[], space: StorageSpace): PackResult {
  const wd = walkwayDepth(space);
  const usableDepth = Math.round((space.depth - wd) * 100) / 100;
  const footprints = toFootprints(lines, space, true).sort(optimisedOrder);
  const { placements, unplaced } = place(footprints, space, usableDepth, true);
  const withFragileLifted = protectFragile(placements);

  return {
    placements: withFragileLifted,
    walkway: wd > 0 ? { x: 0, y: usableDepth, w: space.width, d: wd } : null,
    unplaced,
    floorAreaUsed: floorArea(withFragileLifted),
    stackedUnits: withFragileLifted.reduce((sum, p) => sum + (p.units > 1 ? p.units - 1 : 0), 0),
  };
}
