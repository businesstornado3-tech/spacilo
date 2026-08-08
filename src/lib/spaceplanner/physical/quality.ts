/**
 * Phase 6G — arrangement quality: the anti-scatter objective made measurable.
 *
 * Fitting everything in is necessary but not sufficient. A plan that puts two
 * suitcases three metres apart, leaves a rucksack alone in the middle of the
 * floor, or spreads belongings evenly around the perimeter is a plan nobody
 * would actually build. This module turns "looks like a real storage
 * arrangement" into numbers the packer can optimise against, so the engine can
 * try several deterministic strategies and keep the best one.
 *
 * Nothing here can rescue an invalid plan: hard constraints live in
 * `constraints.ts` and always win.
 */
import { overlapArea, rectArea } from "./space";
import type { ArrangementEntry, PlanningSpace, Rect } from "./types";

/** Two footprints closer than this in both axes count as one cluster. */
export const CLUSTER_GAP_M = 0.4;

/** A footprint further than this from every wall is "out in the open". */
export const CENTRE_MARGIN_M = 0.6;

/** Plans scoring below this are rejected and the next strategy is tried. */
export const QUALITY_THRESHOLD = 62;

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const floorEntries = (entries: ArrangementEntry[]) =>
  entries.filter((entry) => entry.layer === 0);

const grow = (rect: Rect, by: number): Rect => ({
  x: rect.x - by,
  y: rect.y - by,
  w: rect.w + by * 2,
  d: rect.d + by * 2,
});

/**
 * Number of separate storage clusters on the floor.
 *
 * One coherent block is ideal. Two is usually fine (one per wall). Anything
 * more and the arrangement reads as scattered, however valid it is.
 */
export function clusterCount(entries: ArrangementEntry[], gapM = CLUSTER_GAP_M): number {
  const floor = floorEntries(entries);
  if (floor.length === 0) return 0;

  const parent = floor.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== root) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  for (let i = 0; i < floor.length; i += 1) {
    for (let j = i + 1; j < floor.length; j += 1) {
      if (overlapArea(grow(floor[i]!, gapM / 2), grow(floor[j]!, gapM / 2)) > 0) union(i, j);
    }
  }

  return new Set(floor.map((_, index) => find(index))).size;
}

/** Footprints sitting in open floor, away from every wall. */
export function centreFloorCount(space: PlanningSpace, entries: ArrangementEntry[]): number {
  const usable = space.usable;
  return floorEntries(entries).filter((entry) => {
    const left = entry.x - usable.x;
    const right = usable.x + usable.w - (entry.x + entry.w);
    const back = entry.y - usable.y;
    const front = usable.y + usable.d - (entry.y + entry.d);
    return Math.min(left, right, back, front) > CENTRE_MARGIN_M;
  }).length;
}

/** How tightly the whole arrangement sits inside the usable floor, 0–1. */
export function footprintSpread(space: PlanningSpace, entries: ArrangementEntry[]): number {
  const floor = floorEntries(entries);
  if (floor.length === 0) return 0;
  const minX = Math.min(...floor.map((entry) => entry.x));
  const minY = Math.min(...floor.map((entry) => entry.y));
  const maxX = Math.max(...floor.map((entry) => entry.x + entry.w));
  const maxY = Math.max(...floor.map((entry) => entry.y + entry.d));
  const usable = Math.max(0.01, rectArea(space.usable));
  return Math.max(0, Math.min(1, ((maxX - minX) * (maxY - minY)) / usable));
}

/** Small footprints with no neighbour within reach — the classic lone rucksack. */
export function isolatedSmallItems(entries: ArrangementEntry[]): number {
  const floor = floorEntries(entries);
  if (floor.length < 2) return 0;
  const areas = floor.map((entry) => entry.w * entry.d).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] ?? 0;
  return floor.filter((entry) => {
    if (entry.w * entry.d > median) return false;
    return !floor.some(
      (other) => other.key !== entry.key && overlapArea(grow(entry, 0.3), grow(other, 0.05)) > 0,
    );
  }).length;
}

export interface AntiScatterReport {
  /** 0–100. Higher is more consolidated. */
  score: number;
  clusters: number;
  centreFloor: number;
  isolated: number;
  /** Bounding box of the arrangement as a share of the usable floor, 0–1. */
  spread: number;
}

/**
 * The anti-scatter objective.
 *
 * Rewards one contiguous, wall-hugging block. Penalises every extra cluster,
 * every item marooned in open floor and every lone small item.
 */
export function antiScatterReport(
  space: PlanningSpace,
  entries: ArrangementEntry[],
): AntiScatterReport {
  const floor = floorEntries(entries);
  const clusters = clusterCount(entries);
  const centreFloor = centreFloorCount(space, entries);
  const isolated = isolatedSmallItems(entries);
  const spread = footprintSpread(space, entries);

  if (floor.length === 0) {
    return { score: 100, clusters: 0, centreFloor: 0, isolated: 0, spread: 0 };
  }

  // A block that covers a big share of the floor is not scatter, so spread is
  // only penalised relative to how much floor the items genuinely need.
  const used = floor.reduce((sum, entry) => sum + entry.w * entry.d, 0);
  const needed = used / Math.max(0.01, rectArea(space.usable));
  const excessSpread = Math.max(0, spread - Math.min(1, needed * 1.6));

  const score = pct(
    100 -
      Math.max(0, clusters - 1) * 14 -
      centreFloor * 18 -
      isolated * 10 -
      excessSpread * 45,
  );

  return { score, clusters, centreFloor, isolated, spread: Math.round(spread * 100) / 100 };
}

export interface QualityGateResult {
  /** 0–100 arrangement-quality score. */
  score: number;
  passes: boolean;
  issues: string[];
  antiScatter: AntiScatterReport;
}

/**
 * The arrangement-quality gate.
 *
 * Combines the anti-scatter objective with wall use, compactness and vertical
 * use into a single number, and names every problem in plain words so the
 * chosen plan can be explained rather than merely asserted.
 */
export function arrangementQuality({
  space,
  entries,
  wallUse,
  compactness,
  verticalUse,
  grouping,
  valid,
}: {
  space: PlanningSpace;
  entries: ArrangementEntry[];
  wallUse: number;
  compactness: number;
  verticalUse: number;
  grouping: number;
  valid: boolean;
}): QualityGateResult {
  const antiScatter = antiScatterReport(space, entries);
  const issues: string[] = [];

  if (!valid) issues.push("The plan breaks a physical constraint.");
  if (antiScatter.clusters > 2)
    issues.push(`${antiScatter.clusters} separate groups — the belongings should form one block.`);
  if (antiScatter.centreFloor > 0)
    issues.push(`${antiScatter.centreFloor} item(s) left in open floor rather than against a wall.`);
  if (antiScatter.isolated > 0)
    issues.push(`${antiScatter.isolated} small item(s) not grouped with anything else.`);
  if (wallUse < 60) issues.push("Too little of the arrangement touches a wall.");

  const score = pct(
    antiScatter.score * 0.4 + wallUse * 0.22 + compactness * 0.2 + grouping * 0.12 + verticalUse * 0.06,
  );

  return { score, passes: valid && score >= QUALITY_THRESHOLD, issues, antiScatter };
}
