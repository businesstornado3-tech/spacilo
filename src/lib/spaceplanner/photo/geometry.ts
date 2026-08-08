/**
 * Photo geometry — projecting a plan into the user's actual photograph.
 *
 * The homepage result is the user's own photo, not a synthetic room, so the
 * planner's metric placements have to be drawn back onto that image. We model
 * the photographed space as a simple one-point perspective: a floor quad in
 * normalised image coordinates (0–1), with a vanishing direction towards the
 * back wall. It is deliberately approximate — every figure the UI shows next
 * to it is labelled as an estimate.
 */
import type { Placement, StorageSpace } from "../types";

/** Normalised (0–1) image point. */
export interface ImagePoint {
  x: number;
  y: number;
}

/**
 * The visible floor of a photographed space, in normalised image coordinates.
 * Corners run back-left, back-right, front-right, front-left.
 */
export interface FloorQuad {
  backLeft: ImagePoint;
  backRight: ImagePoint;
  frontRight: ImagePoint;
  frontLeft: ImagePoint;
}

/**
 * A reasonable default reading of an indoor space photographed from the
 * doorway. Used until scene analysis supplies a better quad.
 */
export const DEFAULT_FLOOR_QUAD: FloorQuad = {
  backLeft: { x: 0.26, y: 0.54 },
  backRight: { x: 0.74, y: 0.54 },
  frontRight: { x: 0.99, y: 0.97 },
  frontLeft: { x: 0.01, y: 0.97 },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mix = (a: ImagePoint, b: ImagePoint, t: number): ImagePoint => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/**
 * Map a plan-view point onto the floor quad.
 *
 * `u` runs 0→1 left to right across the space width, `v` runs 0→1 from the
 * back wall to the door. Perspective foreshortening is applied to `v` so
 * equal metric depths compress towards the back of the image.
 */
export function floorPoint(quad: FloorQuad, u: number, v: number): ImagePoint {
  const uu = clamp01(u);
  // Non-linear depth: things near the back move less per metre.
  const vv = clamp01(v);
  const perspective = vv / (1 + (1 - vv) * 0.85);
  const back = mix(quad.backLeft, quad.backRight, uu);
  const front = mix(quad.frontLeft, quad.frontRight, uu);
  return mix(back, front, perspective);
}

/** How tall one metre appears at a given depth, as a fraction of image height. */
export function metreHeightAt(quad: FloorQuad, v: number, ceilingHeightM: number): number {
  const nearDepth = Math.abs(quad.frontLeft.y - quad.backLeft.y);
  const near = (nearDepth * 0.92) / Math.max(1, ceilingHeightM);
  const far = near * 0.42;
  return lerp(far, near, clamp01(v));
}

/** A single placement drawn as a simple 3D box in image space. */
export interface ProjectedBox {
  key: string;
  label: string;
  /** Painter's-algorithm order: draw low values first (further away). */
  order: number;
  /** Top face, clockwise from back-left. */
  top: ImagePoint[];
  /** Front face, clockwise from top-left. */
  front: ImagePoint[];
  /** Anchor for an optional label. */
  anchor: ImagePoint;
  fragile: boolean;
  units: number;
}

/**
 * Project every placement of a pack into the photograph.
 *
 * Placements are metric, measured from the back-left corner of the space, so
 * the mapping is a straight division by the space dimensions.
 */
export function projectPlacements(
  placements: Placement[],
  space: StorageSpace,
  quad: FloorQuad = DEFAULT_FLOOR_QUAD,
): ProjectedBox[] {
  const boxes = placements.map<ProjectedBox>((placement) => {
    const u0 = placement.x / space.width;
    const u1 = (placement.x + placement.w) / space.width;
    const v0 = placement.y / space.depth;
    const v1 = (placement.y + placement.d) / space.depth;

    const backLeft = floorPoint(quad, u0, v0);
    const backRight = floorPoint(quad, u1, v0);
    const frontRight = floorPoint(quad, u1, v1);
    const frontLeft = floorPoint(quad, u0, v1);

    // Item height in metres: footprint-derived, one level per stack step.
    const unitHeight = Math.max(0.25, Math.min(1.4, (placement.w + placement.d) / 2));
    const scale = metreHeightAt(quad, v1, space.height);
    const base = placement.level * unitHeight * scale;
    const rise = unitHeight * scale;

    const raise = (point: ImagePoint, amount: number): ImagePoint => ({
      x: point.x,
      y: clamp01(point.y - amount),
    });

    const bottom = [
      raise(backLeft, base),
      raise(backRight, base),
      raise(frontRight, base),
      raise(frontLeft, base),
    ] as ImagePoint[];
    const top = bottom.map((point) => raise(point, rise));

    return {
      key: placement.key,
      label: placement.label,
      order: v1 * 1000 + placement.level,
      top,
      front: [top[3]!, top[2]!, bottom[2]!, bottom[3]!],
      anchor: { x: (top[0]!.x + top[2]!.x) / 2, y: (top[0]!.y + top[2]!.y) / 2 },
      fragile: placement.fragile,
      units: placement.units,
    };
  });

  return boxes.sort((a, b) => a.order - b.order);
}

/** SVG polygon `points` attribute for a face, in a 0–100 viewBox. */
export function toPoints(face: ImagePoint[]): string {
  return face.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
}
