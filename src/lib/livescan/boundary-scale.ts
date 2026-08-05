/**
 * Turning a drawn boundary into real-world size — safely.
 *
 * A single monocular photo contains NO metric information. We therefore refuse
 * to show metres unless the host supplies a defensible scale reference, and we
 * refuse again when the drawn shape shows enough perspective that naive
 * scaling would be misleading.
 *
 * SCALE IS EARNED, NEVER ASSUMED. Every output here is an ESTIMATE the host
 * confirms — never a verified measurement.
 */
import {
  boundaryAreaPx,
  edgeLengthPx,
  isCircle,
  type Boundary,
  type BoundaryTarget,
  type FrameSize,
} from "@/lib/livescan/boundary";

/** A real-world length the host has typed against something in the frame. */
export interface ReferenceEdge {
  /** Which boundary edge the host measured. Circles use the diameter. */
  edgeIndex: number;
  metres: number;
  /** What they measured, for the audit trail shown back to them. */
  label: string;
}

export type ScaleRefusal =
  | "no_reference"
  | "reference_out_of_range"
  | "degenerate_edge"
  | "perspective_unsafe"
  | "invalid_boundary";

export const SCALE_REFUSAL_COPY: Record<ScaleRefusal, string> = {
  no_reference:
    "Add one real measurement from the photo — for example the width of the doorway — and we can work the rest out.",
  reference_out_of_range: "That measurement looks off. Enter a length between 0.1 m and 30 m.",
  degenerate_edge: "That edge is too short to measure from. Drag the corners further apart.",
  perspective_unsafe:
    "This photo is at too much of an angle for us to size it reliably. Shoot it straight on, or enter the measurements yourself.",
  invalid_boundary: "The outline crosses itself. Adjust the corners so the shape is simple.",
};

/** Real measurements we're willing to accept from a photo reference. */
export const MIN_REFERENCE_M = 0.1;
export const MAX_REFERENCE_M = 30;

export type ScaleResult =
  | { ok: true; metresPerPixel: number; provenance: "host_reference_edge" }
  | { ok: false; reason: ScaleRefusal };

/**
 * Perspective check.
 *
 * A four-corner shape photographed close to straight-on has near-equal
 * opposite edges and near-right angles. The further it drifts, the less a
 * single scale factor means. Shapes with more than four corners, and circles,
 * can't be checked this way, so they never earn metric output.
 */
export function perspectiveSafe(boundary: Boundary, frame: FrameSize): boolean {
  if (isCircle(boundary)) return false;
  const points = boundary.points;
  if (points.length !== 4) return false;

  const lengths = [0, 1, 2, 3].map((index) => edgeLengthPx(points, index, frame));
  if (lengths.some((length) => length === null)) return false;
  const [top, right, bottom, left] = lengths as [number, number, number, number];

  const ratio = (a: number, b: number) => Math.min(a, b) / Math.max(a, b);
  if (ratio(top, bottom) < 0.82) return false;
  if (ratio(left, right) < 0.82) return false;

  // Corner angles must stay within ±15° of square.
  for (let index = 0; index < 4; index += 1) {
    const previous = points[(index + 3) % 4]!;
    const current = points[index]!;
    const next = points[(index + 1) % 4]!;
    const v1 = { x: (previous.x - current.x) * frame.width, y: (previous.y - current.y) * frame.height };
    const v2 = { x: (next.x - current.x) * frame.width, y: (next.y - current.y) * frame.height };
    const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    if (mag === 0) return false;
    const angle = (Math.acos(Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / mag))) * 180) / Math.PI;
    if (Math.abs(angle - 90) > 15) return false;
  }
  return true;
}

export function deriveScale(
  boundary: Boundary,
  frame: FrameSize,
  reference: ReferenceEdge | null,
): ScaleResult {
  if (!reference) return { ok: false, reason: "no_reference" };
  if (
    !Number.isFinite(reference.metres) ||
    reference.metres < MIN_REFERENCE_M ||
    reference.metres > MAX_REFERENCE_M
  ) {
    return { ok: false, reason: "reference_out_of_range" };
  }
  if (!perspectiveSafe(boundary, frame)) return { ok: false, reason: "perspective_unsafe" };

  const pixels = isCircle(boundary)
    ? null
    : edgeLengthPx(boundary.points, reference.edgeIndex, frame);
  if (!pixels || pixels < 8) return { ok: false, reason: "degenerate_edge" };

  return { ok: true, metresPerPixel: reference.metres / pixels, provenance: "host_reference_edge" };
}

export interface BoundaryMeasurement {
  target: BoundaryTarget;
  areaM2: number;
  excludedM2: number;
  usableM2: number;
  /** Only for four-corner shapes: the mean of each opposite edge pair. */
  widthM: number | null;
  depthM: number | null;
  /** Present only when the host supplied a usable height. */
  volumeM3: number | null;
  provenance: "host_reference_edge";
  /** Always true. Nothing measured from a photo is ever verified. */
  estimated: true;
}

export interface MeasureInput {
  boundary: Boundary;
  frame: FrameSize;
  scale: Extract<ScaleResult, { ok: true }>;
  target: BoundaryTarget;
  /** Fixed obstructions the host has outlined inside the boundary. */
  exclusions?: Boundary[];
  heightM?: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function measureBoundary(input: MeasureInput): BoundaryMeasurement {
  const { boundary, frame, scale, target, exclusions = [], heightM } = input;
  const m2PerPx2 = scale.metresPerPixel * scale.metresPerPixel;

  const areaM2 = round2(boundaryAreaPx(boundary, frame) * m2PerPx2);
  const excludedM2 = round2(
    exclusions.reduce((total, shape) => total + boundaryAreaPx(shape, frame), 0) * m2PerPx2,
  );
  const usableM2 = round2(Math.max(0, areaM2 - excludedM2));

  let widthM: number | null = null;
  let depthM: number | null = null;
  if (!isCircle(boundary) && boundary.points.length === 4) {
    const edge = (index: number) => (edgeLengthPx(boundary.points, index, frame) ?? 0) * scale.metresPerPixel;
    widthM = round2((edge(0) + edge(2)) / 2);
    depthM = round2((edge(1) + edge(3)) / 2);
  }

  const height = typeof heightM === "number" && heightM > 0 ? heightM : null;
  return {
    target,
    areaM2,
    excludedM2,
    usableM2,
    widthM,
    depthM,
    volumeM3: height ? round2(usableM2 * height) : null,
    provenance: scale.provenance,
    estimated: true,
  };
}
