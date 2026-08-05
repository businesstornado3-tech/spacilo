/**
 * Host boundary geometry.
 *
 * A host draws the portion of a space they actually intend to let. Everything
 * here is PIXEL/IMAGE geometry only — this module deliberately knows nothing
 * about metres. Converting image geometry into real-world size requires a
 * defensible scale source and lives in `boundary-scale.ts`.
 *
 * Points are normalised to the frame (0–1 on each axis) so a boundary survives
 * rotation, resizing and re-rendering at a different display size.
 */

export type BoundaryShape = "rectangle" | "square" | "circle" | "polygon";

/** What the drawn region represents. Never assume "floor". */
export type BoundaryTarget = "floor" | "wall_shelf" | "volume";

export const BOUNDARY_TARGET_LABEL: Record<BoundaryTarget, string> = {
  floor: "Floor area",
  wall_shelf: "Wall or shelf area",
  volume: "Full storage volume",
};

export interface Point {
  x: number;
  y: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface PolygonBoundary {
  shape: "rectangle" | "square" | "polygon";
  points: Point[];
}

export interface CircleBoundary {
  shape: "circle";
  centre: Point;
  /** Normalised against the frame WIDTH. */
  radius: number;
}

export type Boundary = PolygonBoundary | CircleBoundary;

export const MIN_POLYGON_POINTS = 3;
export const MAX_POLYGON_POINTS = 12;

export function clampPoint(point: Point): Point {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

export function isCircle(boundary: Boundary): boundary is CircleBoundary {
  return boundary.shape === "circle";
}

/** A sensible starting shape covering the middle of the frame. */
export function defaultBoundary(shape: BoundaryShape): Boundary {
  if (shape === "circle") return { shape: "circle", centre: { x: 0.5, y: 0.6 }, radius: 0.25 };
  if (shape === "square") {
    return {
      shape: "square",
      points: [
        { x: 0.3, y: 0.4 },
        { x: 0.7, y: 0.4 },
        { x: 0.7, y: 0.8 },
        { x: 0.3, y: 0.8 },
      ],
    };
  }
  const points: Point[] = [
    { x: 0.15, y: 0.45 },
    { x: 0.85, y: 0.45 },
    { x: 0.85, y: 0.9 },
    { x: 0.15, y: 0.9 },
  ];
  return { shape: shape === "polygon" ? "polygon" : "rectangle", points };
}

/** Approximates a circle as a polygon so one area routine serves every shape. */
export function circleToPolygon(circle: CircleBoundary, frame: FrameSize, steps = 48): Point[] {
  const aspect = frame.height > 0 ? frame.width / frame.height : 1;
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return clampPoint({
      x: circle.centre.x + Math.cos(angle) * circle.radius,
      y: circle.centre.y + Math.sin(angle) * circle.radius * aspect,
    });
  });
}

export function boundaryPoints(boundary: Boundary, frame: FrameSize): Point[] {
  return isCircle(boundary) ? circleToPolygon(boundary, frame) : boundary.points;
}

export function toPixels(point: Point, frame: FrameSize): Point {
  return { x: point.x * frame.width, y: point.y * frame.height };
}

export function distancePx(a: Point, b: Point, frame: FrameSize): number {
  const pa = toPixels(a, frame);
  const pb = toPixels(b, frame);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Shoelace area in square pixels. Always non-negative. */
export function polygonAreaPx(points: Point[], frame: FrameSize): number {
  if (points.length < 3) return 0;
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = toPixels(points[index]!, frame);
    const b = toPixels(points[(index + 1) % points.length]!, frame);
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

export function boundaryAreaPx(boundary: Boundary, frame: FrameSize): number {
  return polygonAreaPx(boundaryPoints(boundary, frame), frame);
}

/** Edge `index` runs from point `index` to the next point, wrapping around. */
export function edgeLengthPx(points: Point[], index: number, frame: FrameSize): number | null {
  if (index < 0 || index >= points.length || points.length < 2) return null;
  const length = distancePx(points[index]!, points[(index + 1) % points.length]!, frame);
  return length > 0 ? length : null;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/** True when any two non-adjacent edges cross — an invalid boundary. */
export function selfIntersects(points: Point[]): boolean {
  const count = points.length;
  if (count < 4) return false;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) continue;
      if (
        segmentsCross(
          points[i]!,
          points[(i + 1) % count]!,
          points[j]!,
          points[(j + 1) % count]!,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isValidBoundary(boundary: Boundary): boolean {
  if (isCircle(boundary)) return boundary.radius > 0.02;
  if (boundary.points.length < MIN_POLYGON_POINTS) return false;
  return !selfIntersects(boundary.points);
}

/**
 * Moves one handle.
 *
 * rectangle/polygon — the handle moves freely.
 * square           — the opposite corner is anchored and the shape stays square.
 * circle           — handle 0 moves the centre, handle 1 sets the radius.
 */
export function moveHandle(boundary: Boundary, index: number, next: Point): Boundary {
  const target = clampPoint(next);

  if (isCircle(boundary)) {
    if (index === 0) return { ...boundary, centre: target };
    const radius = Math.max(0.03, Math.min(0.5, Math.abs(target.x - boundary.centre.x)));
    return { ...boundary, radius };
  }

  if (index < 0 || index >= boundary.points.length) return boundary;

  if (boundary.shape === "square") {
    const anchor = boundary.points[(index + 2) % 4] ?? boundary.points[0]!;
    const side = Math.max(Math.abs(target.x - anchor.x), Math.abs(target.y - anchor.y));
    const signX = target.x >= anchor.x ? 1 : -1;
    const signY = target.y >= anchor.y ? 1 : -1;
    const corner = clampPoint({ x: anchor.x + side * signX, y: anchor.y + side * signY });
    const points: Point[] = [
      { x: anchor.x, y: anchor.y },
      { x: corner.x, y: anchor.y },
      { x: corner.x, y: corner.y },
      { x: anchor.x, y: corner.y },
    ];
    // Keep the anchored corner in its original slot so handles stay stable.
    const rotation = (index + 2) % 4;
    const ordered = points.map((_, slot) => points[(slot - rotation + 8) % 4]!);
    return { shape: "square", points: ordered };
  }

  const points = boundary.points.map((point, slot) => (slot === index ? target : point));
  return { ...boundary, points };
}

/** Inserts a point at the midpoint of edge `index`. Polygons only. */
export function addPoint(boundary: Boundary, index: number): Boundary {
  if (isCircle(boundary) || boundary.shape !== "polygon") return boundary;
  if (boundary.points.length >= MAX_POLYGON_POINTS) return boundary;
  const points = [...boundary.points];
  const a = points[index % points.length]!;
  const b = points[(index + 1) % points.length]!;
  points.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return { shape: "polygon", points };
}

export function removePoint(boundary: Boundary, index: number): Boundary {
  if (isCircle(boundary) || boundary.shape !== "polygon") return boundary;
  if (boundary.points.length <= MIN_POLYGON_POINTS) return boundary;
  return { shape: "polygon", points: boundary.points.filter((_, slot) => slot !== index) };
}

export function handlePoints(boundary: Boundary, frame: FrameSize): Point[] {
  if (!isCircle(boundary)) return boundary.points;
  const aspect = frame.height > 0 ? frame.width / frame.height : 1;
  return [boundary.centre, { x: boundary.centre.x + boundary.radius, y: boundary.centre.y }].map(
    clampPoint,
  ) as Point[];
  void aspect;
}
