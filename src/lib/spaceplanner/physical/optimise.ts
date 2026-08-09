/**
 * Phase 6Q — the deterministic candidate-search arrangement optimiser.
 *
 * This replaces the first-fit row packer as the primary placement engine. For
 * every object the engine generates every physically valid candidate position
 * (wall runs, corners, contact points against already-placed objects, both
 * legal rotations), rejects every candidate that breaks a hard constraint,
 * scores the survivors with a numeric deterministic function, and takes the
 * best. After every object has been placed it runs a bounded improvement pass
 * that relocates objects one at a time and keeps a change only when the whole
 * arrangement scores better.
 *
 * No model is involved at any point. No randomness is involved at any point.
 * The same manifest and the same room geometry always produce the same
 * coordinates.
 */
import { classifyItem, classPlacementOrder, type PhysicalClass } from "./classify";
import { orientationsFor, stacksFor, type OrientationOption, type StackCandidate } from "./items";
import { canSupport, prefersSurface, relationMap, storageZoneFor } from "./relations";
import { contains, intersects, rectArea } from "./space";
import type {
  ArrangementEntry,
  PlacementZone,
  PlanningItem,
  PlanningSpace,
  Rect,
} from "./types";


const round2 = (value: number) => Math.round(value * 100) / 100;
const EPS = 0.001;
/** Gaps narrower than this can never be used again, so they are penalised. */
export const DEAD_GAP_M = 0.25;
/** Most candidate coordinates considered per axis. Keeps the search bounded. */
const MAX_ANCHORS = 36;

export interface SearchInput {
  items: PlanningItem[];
  space: PlanningSpace;
  ceiling: number;
  /** Doorway, corridor and obstacles: never available for storage. */
  blockers: Rect[];
  /** Units the search could not place, keyed by item id. Mutated. */
  unplacedUnits: Map<string, number>;
}

interface Placed {
  entry: ArrangementEntry;
  item: PlanningItem;
  cls: PhysicalClass;
}

function stackedHeight(option: OrientationOption, units: number, unitHeight: number): number {
  if (units <= 1) return option.h;
  return option.orientation === "upright" ? option.h : unitHeight * units;
}

function uniqueSorted(values: number[]): number[] {
  const out = [...new Set(values.map((value) => round2(value)))].sort((a, b) => a - b);
  return out.length > MAX_ANCHORS ? out.slice(0, MAX_ANCHORS) : out;
}

/** Shared edge length between two touching rectangles, 0 when they don't touch. */
export function contactLength(a: Rect, b: Rect, tolerance = 0.03): number {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  const touchX = Math.abs(a.x + a.w - b.x) <= tolerance || Math.abs(b.x + b.w - a.x) <= tolerance;
  const touchY = Math.abs(a.y + a.d - b.y) <= tolerance || Math.abs(b.y + b.d - a.y) <= tolerance;
  if (touchX && overlapY > 0) return overlapY;
  if (touchY && overlapX > 0) return overlapX;
  return 0;
}

/** How much of the rectangle's perimeter sits against the edge of the usable area. */
export function wallContact(rect: Rect, usable: Rect): number {
  let length = 0;
  if (Math.abs(rect.x - usable.x) <= 0.03) length += rect.d;
  if (Math.abs(rect.x + rect.w - (usable.x + usable.w)) <= 0.03) length += rect.d;
  if (Math.abs(rect.y - usable.y) <= 0.03) length += rect.w;
  if (Math.abs(rect.y + rect.d - (usable.y + usable.d)) <= 0.03) length += rect.w;
  return length;
}

function zoneFor(rect: Rect, usable: Rect): PlacementZone {
  const atBack = Math.abs(rect.y - usable.y) <= 0.05;
  const atLeft = Math.abs(rect.x - usable.x) <= 0.05;
  const atRight = Math.abs(rect.x + rect.w - (usable.x + usable.w)) <= 0.05;
  if (atBack && (atLeft || atRight)) return "corner";
  if (atBack) return "back-wall";
  if (atLeft) return "left-wall";
  if (atRight) return "right-wall";
  return "interior";
}

function hullArea(rects: Rect[]): number {
  if (rects.length === 0) return 0;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.d));
  return (maxX - minX) * (maxY - minY);
}

/** Slivers of floor left between this candidate and its neighbours or walls. */
export function deadGapPenalty(rect: Rect, usable: Rect, placed: Rect[]): number {
  const leftGap = rect.x - usable.x;
  const backGap = rect.y - usable.y;
  const rightGap = usable.x + usable.w - (rect.x + rect.w);
  const frontGap = usable.y + usable.d - (rect.y + rect.d);
  let penalty = 0;
  for (const gap of [leftGap, backGap, rightGap, frontGap]) {
    if (gap > EPS && gap < DEAD_GAP_M) penalty += 1;
  }
  for (const other of placed) {
    const gapX =
      rect.x >= other.x + other.w
        ? rect.x - (other.x + other.w)
        : other.x >= rect.x + rect.w
          ? other.x - (rect.x + rect.w)
          : -1;
    const overlapY = Math.min(rect.y + rect.d, other.y + other.d) - Math.max(rect.y, other.y);
    if (gapX > EPS && gapX < DEAD_GAP_M && overlapY > 0) penalty += 1;
  }
  return penalty;
}

export interface CandidateScoreInput {
  rect: Rect;
  cls: PhysicalClass;
  item: PlanningItem;
  rotationDeg: 0 | 90;
  space: PlanningSpace;
  placed: Placed[];
}

/**
 * The deterministic candidate score. Higher is better. Every term is a plain
 * arithmetic function of geometry the engine already knows — no model, no
 * heuristic table lookups, no tie-breaking by chance.
 */
export function scoreCandidate(input: CandidateScoreInput): number {
  const { rect, cls, item, rotationDeg, space, placed } = input;
  const usable = space.usable;
  const others = placed.map((entry) => entry.entry as Rect);

  const walls = wallContact(rect, usable);
  const corner = zoneFor(rect, usable) === "corner" ? 1 : 0;

  let neighbour = 0;
  let sameCategory = 0;
  let sameClass = 0;
  for (const other of placed) {
    const touch = contactLength(rect, other.entry);
    if (touch <= 0) continue;
    neighbour += touch;
    if (other.item.category === item.category) sameCategory += touch;
    if (other.cls === cls) sameClass += touch;
  }

  const hullBefore = hullArea(others);
  const hullAfter = hullArea([...others, rect]);
  const growth = Math.max(0, hullAfter - hullBefore) - rectArea(rect);

  const gaps = deadGapPenalty(rect, usable, others);
  // Gravity towards the back-left corner keeps the block contiguous and the
  // front of the space free for access.
  const gravity = (rect.y - usable.y) * 2 + (rect.x - usable.x) * 1.2;

  const isolated = placed.length > 0 && neighbour <= 0 && walls <= 0 ? 1 : 0;

  return round2(
    walls * 9 +
      corner * 7 +
      neighbour * 11 +
      sameCategory * 4 +
      sameClass * 3 +
      (cls === "SMALL_ITEM" ? neighbour * 6 : 0) -
      growth * 14 -
      gaps * 5 -
      gravity * 2.5 -
      isolated * 25 -
      (rotationDeg === 90 ? 0.4 : 0),
  );
}

/** Total arrangement objective, used by the improvement pass only. */
export function arrangementObjective(entries: ArrangementEntry[], space: PlanningSpace): number {
  const floor = entries.filter((entry) => entry.layer === 0);
  if (floor.length === 0) return 0;
  const used = floor.reduce((sum, entry) => sum + entry.w * entry.d, 0);
  const hull = Math.max(0.01, hullArea(floor));
  let contact = 0;
  let walls = 0;
  for (let i = 0; i < floor.length; i += 1) {
    walls += wallContact(floor[i]!, space.usable);
    for (let j = i + 1; j < floor.length; j += 1) {
      contact += contactLength(floor[i]!, floor[j]!);
    }
  }
  const isolated = floor.filter(
    (entry) =>
      wallContact(entry, space.usable) <= 0 &&
      !floor.some((other) => other.key !== entry.key && contactLength(entry, other) > 0),
  ).length;
  return round2((used / hull) * 100 + contact * 8 + walls * 4 - isolated * 30 - hull * 3);
}

interface Candidate {
  rect: Rect;
  option: OrientationOption;
  score: number;
}

function candidateAnchors(usable: Rect, blockers: Rect[], placed: Placed[]): {
  xs: number[];
  ys: number[];
} {
  const rects = [...blockers, ...placed.map((entry) => entry.entry as Rect)];
  const xs = [usable.x, usable.x + usable.w];
  const ys = [usable.y, usable.y + usable.d];
  for (const rect of rects) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.d);
  }
  return { xs: uniqueSorted(xs), ys: uniqueSorted(ys) };
}

/** Every deterministic candidate position for one footprint, already filtered. */
export function candidatesFor(
  stack: StackCandidate,
  cls: PhysicalClass,
  options: OrientationOption[],
  space: PlanningSpace,
  blockers: Rect[],
  placed: Placed[],
): Candidate[] {
  const usable = space.usable;
  const { xs, ys } = candidateAnchors(usable, blockers, placed);
  const out: Candidate[] = [];

  for (const option of options) {
    const positionsX = uniqueSorted([
      ...xs,
      ...xs.map((x) => x - option.w),
      usable.x + usable.w - option.w,
    ]).filter((x) => x >= usable.x - EPS && x + option.w <= usable.x + usable.w + EPS);
    const positionsY = uniqueSorted([
      ...ys,
      ...ys.map((y) => y - option.d),
      usable.y + usable.d - option.d,
    ]).filter((y) => y >= usable.y - EPS && y + option.d <= usable.y + usable.d + EPS);

    for (const x of positionsX) {
      for (const y of positionsY) {
        const rect: Rect = { x: round2(x), y: round2(y), w: round2(option.w), d: round2(option.d) };
        // HARD CONSTRAINTS — an invalid candidate never reaches scoring.
        if (!contains(usable, rect)) continue;
        if (blockers.some((blocker) => intersects(rect, blocker))) continue;
        if (placed.some((entry) => entry.entry.layer === 0 && intersects(rect, entry.entry))) continue;
        // A small item must join the arrangement, never sit alone in the floor.
        if (cls === "SMALL_ITEM" && placed.length > 0) {
          const touching =
            wallContact(rect, usable) > 0 ||
            placed.some((entry) => contactLength(rect, entry.entry) > 0);
          if (!touching) continue;
        }
        out.push({
          rect,
          option,
          score: scoreCandidate({
            rect,
            cls,
            item: stack.item,
            rotationDeg: option.rotationDeg,
            space,
            placed,
          }),
        });
      }
    }
  }
  return out;
}

/** Highest score wins; ties resolve to the rear-most, then left-most, then unrotated. */
function bestCandidate(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.score > best.score + 0.0001) {
      best = candidate;
      continue;
    }
    if (Math.abs(candidate.score - best.score) <= 0.0001) {
      if (candidate.rect.y < best.rect.y - EPS) best = candidate;
      else if (Math.abs(candidate.rect.y - best.rect.y) <= EPS) {
        if (candidate.rect.x < best.rect.x - EPS) best = candidate;
        else if (
          Math.abs(candidate.rect.x - best.rect.x) <= EPS &&
          candidate.option.rotationDeg < best.option.rotationDeg
        ) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

/**
 * Places every floor object by candidate search, largest classes first, then
 * runs the improvement pass. Wall-mounted objects are handled separately by
 * the wall-run planner and never appear here.
 */
export function searchPlacements(input: SearchInput): ArrangementEntry[] {
  const { space, ceiling, blockers, unplacedUnits } = input;
  const floorItems = input.items.filter((item) => classifyItem(item) !== "WALL_MOUNTED");
  const ordered = [...floorItems].sort(classPlacementOrder);
  const stacks: StackCandidate[] = [];
  for (const item of ordered) {
    stacks.push(...stacksFor([item], ceiling));
  }

  const placed: Placed[] = [];
  let key = 0;

  for (const stack of stacks) {
    const cls = classifyItem(stack.item);
    const unitHeight = Math.max(0.05, Math.round(stack.item.heightCm) / 100);
    const options = orientationsFor(stack.item, ceiling).filter(
      (option) => stackedHeight(option, stack.units, unitHeight) <= ceiling + EPS,
    );
    const candidates = candidatesFor(stack, cls, options, space, blockers, placed);
    const winner = bestCandidate(candidates);
    if (!winner) {
      unplacedUnits.set(stack.item.id, (unplacedUnits.get(stack.item.id) ?? 0) + stack.units);
      continue;
    }
    const height = stackedHeight(winner.option, stack.units, unitHeight);
    placed.push({
      item: stack.item,
      cls,
      entry: {
        key: `search-${key}-${stack.item.id}`,
        itemId: stack.item.id,
        label: stack.item.label,
        units: stack.units,
        x: winner.rect.x,
        y: winner.rect.y,
        w: winner.rect.w,
        d: winner.rect.d,
        heightM: round2(height),
        baseHeightM: 0,
        layer: 0,
        rotationDeg: winner.option.rotationDeg,
        orientation: winner.option.orientation,
        zone: zoneFor(winner.rect, space.usable),
        supportsItemIds: [],
        supportedBy: null,
        // Small items are consolidated into one labelled zone rather than
        // treated as miniature furniture scattered across the floor.
        groupId: cls === "SMALL_ITEM" ? "group-small-items" : stack.groupId,
        fragile: stack.item.fragile,
        weight: stack.item.weight,
        confidence: stack.item.confidence,
        mounted: false,
      },
    });
    key += 1;
  }

  return improvePlacements(placed, space, blockers, ceiling).map((entry) => entry.entry);
}

/**
 * Deterministic improvement pass: each object in turn is lifted out and
 * re-placed by the same candidate search against everything else. The move is
 * kept only when the whole arrangement objective improves and every hard
 * constraint still holds.
 */
export function improvePlacements(
  placed: Placed[],
  space: PlanningSpace,
  blockers: Rect[],
  ceiling: number,
  passes = 2,
): Placed[] {
  let current = [...placed];

  for (let pass = 0; pass < passes; pass += 1) {
    let improvedThisPass = false;
    for (let index = 0; index < current.length; index += 1) {
      const subject = current[index]!;
      const others = current.filter((_, other) => other !== index);
      const before = arrangementObjective(
        current.map((entry) => entry.entry),
        space,
      );
      const unitHeight = Math.max(0.05, Math.round(subject.item.heightCm) / 100);
      const options = orientationsFor(subject.item, ceiling).filter(
        (option) => stackedHeight(option, subject.entry.units, unitHeight) <= ceiling + EPS,
      );
      const candidates = candidatesFor(
        { item: subject.item, units: subject.entry.units, groupId: subject.entry.groupId },
        subject.cls,
        options,
        space,
        blockers,
        others,
      );
      const winner = bestCandidate(candidates);
      if (!winner) continue;
      const moved: Placed = {
        ...subject,
        entry: {
          ...subject.entry,
          x: winner.rect.x,
          y: winner.rect.y,
          w: winner.rect.w,
          d: winner.rect.d,
          heightM: round2(stackedHeight(winner.option, subject.entry.units, unitHeight)),
          rotationDeg: winner.option.rotationDeg,
          orientation: winner.option.orientation,
          zone: zoneFor(winner.rect, space.usable),
        },
      };
      const next = [...others.slice(0, index), moved, ...others.slice(index)];
      const after = arrangementObjective(
        next.map((entry) => entry.entry),
        space,
      );
      if (after > before + 0.01) {
        current = next;
        improvedThisPass = true;
      }
    }
    if (!improvedThisPass) break;
  }

  return current;
}
