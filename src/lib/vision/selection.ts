/**
 * User-controlled photo selection.
 *
 * PRINCIPLE: a photograph is not an inventory list. What the user wants to
 * store, and which part of a room they want to let out, is a decision only the
 * user can make. Every selection here is a normalised (0–1) region of a photo
 * that constrains what the vision model is allowed to treat as inventory or as
 * storage area.
 *
 * Everything in this file is pure so the same model can be used on the client,
 * inside the detection endpoint and in tests.
 */

export type SelectionShape = "rect" | "square" | "ellipse" | "lasso" | "full";

export interface Point {
  /** 0–1 across the photo's width. */
  x: number;
  /** 0–1 down the photo's height. */
  y: number;
}

export interface PhotoSelection {
  id: string;
  photoId: string;
  shape: SelectionShape;
  /** Normalised outline. Rectangles keep their four corners. */
  points: Point[];
  /** Optional user hint, e.g. "baby crib". */
  label?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_PHOTO_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function clampPoint(point: Point): Point {
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

let selectionCounter = 0;

function makeId(photoId: string): string {
  selectionCounter += 1;
  return `sel-${photoId}-${selectionCounter}`;
}

export function fullSelection(photoId: string): PhotoSelection {
  return { id: makeId(photoId), photoId, shape: "full", points: FULL_PHOTO_POINTS };
}

/** Two dragged corners → a rectangle. */
export function rectSelection(photoId: string, a: Point, b: Point): PhotoSelection {
  const p1 = clampPoint(a);
  const p2 = clampPoint(b);
  const x1 = Math.min(p1.x, p2.x);
  const x2 = Math.max(p1.x, p2.x);
  const y1 = Math.min(p1.y, p2.y);
  const y2 = Math.max(p1.y, p2.y);
  return {
    id: makeId(photoId),
    photoId,
    shape: "rect",
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
  };
}

/**
 * A square selection, sized by the smaller drag axis so it always stays inside
 * the photo. `aspect` is photo width / height, so the square is square on
 * screen rather than in normalised space.
 */
export function squareSelection(photoId: string, a: Point, b: Point, aspect = 1): PhotoSelection {
  const p1 = clampPoint(a);
  const p2 = clampPoint(b);
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const sideY = Math.min(dy, dx * aspect);
  const sideX = sideY / (aspect || 1);
  const x1 = Math.min(p1.x, p1.x + Math.sign(p2.x - p1.x || 1) * sideX);
  const y1 = Math.min(p1.y, p1.y + Math.sign(p2.y - p1.y || 1) * sideY);
  return rectSelection(photoId, { x: x1, y: y1 }, { x: x1 + sideX, y: y1 + sideY });
}

/** An ellipse, approximated as a polygon so one geometry path serves all shapes. */
export function ellipseSelection(
  photoId: string,
  a: Point,
  b: Point,
  segments = 24,
): PhotoSelection {
  const p1 = clampPoint(a);
  const p2 = clampPoint(b);
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const rx = Math.abs(p2.x - p1.x) / 2;
  const ry = Math.abs(p2.y - p1.y) / 2;
  const points: Point[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(clampPoint({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }));
  }
  return { id: makeId(photoId), photoId, shape: "ellipse", points };
}

/** A freehand outline. Sparse points are kept; the caller samples the pointer. */
export function lassoSelection(photoId: string, points: Point[]): PhotoSelection {
  return {
    id: makeId(photoId),
    photoId,
    shape: "lasso",
    points: points.map(clampPoint),
  };
}

export function boundingBox(selection: PhotoSelection): BoundingBox {
  if (selection.points.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = selection.points.map((point) => point.x);
  const ys = selection.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(0, Math.max(...xs) - x),
    height: Math.max(0, Math.max(...ys) - y),
  };
}

/** Share of the photo the selection covers, by bounding box. */
export function selectionCoverage(selection: PhotoSelection): number {
  const box = boundingBox(selection);
  return Math.max(0, Math.min(1, box.width * box.height));
}

export function isFullPhoto(selection: PhotoSelection): boolean {
  return selection.shape === "full" || selectionCoverage(selection) > 0.985;
}

/** A selection smaller than this is almost certainly an accidental tap. */
export const MIN_SELECTION_COVERAGE = 0.004;

export function isUsableSelection(selection: PhotoSelection): boolean {
  if (selection.shape === "full") return true;
  if (selection.points.length < 3) return false;
  return selectionCoverage(selection) >= MIN_SELECTION_COVERAGE;
}

/** Even-odd point-in-polygon, used for hit testing an existing selection. */
export function pointInSelection(selection: PhotoSelection, point: Point): boolean {
  if (selection.shape === "full") return true;
  const pts = selection.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i]!;
    const b = pts[j]!;
    const straddles = a.y > point.y !== b.y > point.y;
    if (
      straddles &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Grows a box by `pad` on every side, so context for scale is preserved. */
export function padBox(box: BoundingBox, pad: number): BoundingBox {
  const x = clamp01(box.x - pad);
  const y = clamp01(box.y - pad);
  return {
    x,
    y,
    width: Math.min(1 - x, box.width + pad * 2),
    height: Math.min(1 - y, box.height + pad * 2),
  };
}

/** Stable signature for caching. Same photo + same selection = same key. */
export function selectionSignature(selection: PhotoSelection): string {
  const rounded = selection.points
    .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
    .join(";");
  return `${selection.shape}|${rounded}`;
}

export function selectionsSignature(selections: PhotoSelection[]): string {
  return selections
    .map((selection) => `${selection.photoId}:${selectionSignature(selection)}`)
    .sort()
    .join("~");
}

/** Human description sent to the model as an extra constraint. */
export function describeSelection(selection: PhotoSelection): string {
  if (isFullPhoto(selection)) return "the whole photograph";
  const box = boundingBox(selection);
  const h = box.x + box.width / 2 < 0.4 ? "left" : box.x + box.width / 2 > 0.6 ? "right" : "centre";
  const v = box.y + box.height / 2 < 0.4 ? "upper" : box.y + box.height / 2 > 0.6 ? "lower" : "middle";
  const size = selectionCoverage(selection) > 0.5 ? "large" : "clearly bounded";
  return `a ${size} region in the ${v} ${h} of the photograph${
    selection.label ? ` containing the ${selection.label}` : ""
  }`;
}
