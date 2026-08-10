/**
 * Phase 6Z — surfaces as finite 2D packing areas.
 *
 * Before this phase a small object could only be put on a surface by sliding
 * it along one axis: the engine tracked a single "used width" per base, so the
 * second object on a TV stand had to start where the first one ended and the
 * third usually fell back to the floor. The result was exactly the failure the
 * product kept showing — bottles, toys and boxes scattered across the floor
 * while a perfectly good stand top sat empty.
 *
 * Here a support surface is treated as what it physically is: a rectangle that
 * can be packed in two dimensions. Placement is bottom-left, anchored on the
 * edges of what is already on the surface, so several objects share a top in
 * rows and columns, always inside the boundary, always deterministic.
 *
 * Nothing here decides WHETHER an object may be supported — that stays with
 * `canSupport` / `isSafeSupportSurface` in relations.ts, which is what keeps
 * suitcases, holdalls, backpacks and soft goods out of the base list.
 */
import { isRenderableSupport } from "./relations";
import type { PlanningItem, Rect } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;
const EPS = 0.001;

/** Clearance kept between the edge of a surface and anything standing on it. */
export const SURFACE_MARGIN_M = 0.02;
/** Clearance kept between two objects sharing one surface. */
export const SURFACE_GAP_M = 0.02;

/** The rectangle of a base that may actually carry objects, in room metres. */
export function usableSurfaceRect(base: Rect): Rect {
  const w = round2(base.w - SURFACE_MARGIN_M * 2);
  const d = round2(base.d - SURFACE_MARGIN_M * 2);
  if (w <= 0 || d <= 0) return { x: round2(base.x), y: round2(base.y), w: 0, d: 0 };
  return { x: round2(base.x + SURFACE_MARGIN_M), y: round2(base.y + SURFACE_MARGIN_M), w, d };
}

function fitsInside(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.d <= outer.y + outer.d + EPS
  );
}

function overlaps(a: Rect, b: Rect, gap = SURFACE_GAP_M): boolean {
  return (
    a.x < b.x + b.w + gap - EPS &&
    b.x < a.x + a.w + gap - EPS &&
    a.y < b.y + b.d + gap - EPS &&
    b.y < a.y + a.d + gap - EPS
  );
}

export interface SurfaceFit {
  rect: Rect;
  rotationDeg: 0 | 90;
  /** Share of the surface occupied once this object is on it. 0–1. */
  utilisation: number;
}

/**
 * Bottom-left 2D packing against the edges of what is already on the surface.
 * Returns the position an object of `w × d` should take, or null when the
 * surface genuinely cannot hold it.
 */
export function packOnSurface(
  surface: Rect,
  occupied: Rect[],
  w: number,
  d: number,
  allowRotation = true,
): SurfaceFit | null {
  if (surface.w <= 0 || surface.d <= 0) return null;

  const orientations: { w: number; d: number; rotationDeg: 0 | 90 }[] = [
    { w: round2(w), d: round2(d), rotationDeg: 0 },
  ];
  if (allowRotation && Math.abs(w - d) > EPS) {
    orientations.push({ w: round2(d), d: round2(w), rotationDeg: 90 });
  }

  let best: SurfaceFit | null = null;
  const surfaceArea = Math.max(EPS, surface.w * surface.d);
  const usedArea = occupied.reduce((sum, rect) => sum + rect.w * rect.d, 0);

  for (const orientation of orientations) {
    const xs = new Set<number>([surface.x]);
    const ys = new Set<number>([surface.y]);
    for (const rect of occupied) {
      xs.add(round2(rect.x + rect.w + SURFACE_GAP_M));
      ys.add(round2(rect.y + rect.d + SURFACE_GAP_M));
      xs.add(round2(rect.x));
      ys.add(round2(rect.y));
    }

    const sortedX = [...xs].sort((a, b) => a - b);
    const sortedY = [...ys].sort((a, b) => a - b);

    for (const y of sortedY) {
      for (const x of sortedX) {
        const rect: Rect = {
          x: round2(x),
          y: round2(y),
          w: orientation.w,
          d: orientation.d,
        };
        if (!fitsInside(surface, rect)) continue;
        if (occupied.some((other) => overlaps(rect, other))) continue;
        const candidate: SurfaceFit = {
          rect,
          rotationDeg: orientation.rotationDeg,
          utilisation: Math.min(1, (usedArea + rect.w * rect.d) / surfaceArea),
        };
        // Bottom-left wins: rear-most row, then left-most column, then the
        // unrotated orientation. Purely positional, so it never varies.
        if (
          !best ||
          candidate.rect.y < best.rect.y - EPS ||
          (Math.abs(candidate.rect.y - best.rect.y) <= EPS &&
            (candidate.rect.x < best.rect.x - EPS ||
              (Math.abs(candidate.rect.x - best.rect.x) <= EPS &&
                candidate.rotationDeg < best.rotationDeg)))
        ) {
          best = candidate;
        }
        break; // first x in this row is the left-most fit for this row
      }
    }
  }

  return best;
}

export interface SurfaceCandidate {
  baseKey: string;
  baseItemId: string;
  fit: SurfaceFit;
  score: number;
}

/**
 * How attractive one elevated placement is, compared with the alternatives.
 * Higher is better. Every term is arithmetic over geometry the planner already
 * knows: no model, no randomness.
 */
export function scoreSurfaceCandidate(input: {
  baseItem: PlanningItem;
  baseTopHeightM: number;
  fit: SurfaceFit;
  related: boolean;
}): number {
  const { baseItem, baseTopHeightM, fit, related } = input;
  return round2(
    // Filling a surface is the whole point: reward utilisation heavily.
    fit.utilisation * 40 +
      // A lower surface is easier to reach and easier to draw convincingly.
      Math.max(0, 1.4 - baseTopHeightM) * 12 +
      (related ? 25 : 0) +
      (isRenderableSupport(baseItem.label) ? 14 : 0) +
      (baseItem.weight === "heavy" ? 6 : baseItem.weight === "medium" ? 3 : 0) -
      (fit.rotationDeg === 90 ? 0.5 : 0),
  );
}

/**
 * Phase 6Z, Part I — the floor-occupation penalty.
 *
 * A small object standing on the floor when a safe surface was available is a
 * planning failure, not a stylistic choice. The penalty is deliberately large
 * enough to change which arrangement wins rather than merely nudge it.
 */
export const FLOOR_OCCUPATION_PENALTY = 30;

/** Small footprints left on the floor, in m². */
export function smallFloorFootprint(
  entries: { layer: number; w: number; d: number }[],
  smallFootprintM2: number,
): number {
  return round2(
    entries
      .filter((entry) => entry.layer === 0 && entry.w * entry.d <= smallFootprintM2 + EPS)
      .reduce((sum, entry) => sum + entry.w * entry.d, 0),
  );
}
