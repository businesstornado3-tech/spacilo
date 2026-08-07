/**
 * Stage 5 — dimension estimation.
 *
 * Starts from cautious taxonomy figures and adjusts them by the apparent size
 * of the detection in frame, then reports a plausible range around the result.
 * Nothing here is a measurement, and the contract says so: every value ships
 * with a min, a max, a confidence and the basis it came from.
 */
import type { VisionDimensions } from "./contracts";
import type { FusedDetection } from "./fusion";
import { detectionClass } from "./taxonomy";

/** Widest adjustment the apparent size may make to a taxonomy figure. */
const MAX_SCALE_ADJUSTMENT = 0.12;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Mean box area across frames — the only visual scale cue available. */
function apparentScale(detection: FusedDetection): number {
  if (detection.boxes.length === 0) return 0.5;
  const total = detection.boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  return total / detection.boxes.length;
}

export function estimateDimensions(detection: FusedDetection): VisionDimensions {
  const entry = detectionClass(detection.classKey);
  const base = entry
    ? { width: entry.width, depth: entry.depth, height: entry.height }
    : { width: 50, depth: 40, height: 40 };

  // A large-in-frame object is nudged up, a small one down — gently.
  const scale = 1 + (apparentScale(detection) - 0.25) * MAX_SCALE_ADJUSTMENT * 2;
  const widthCm = Math.round(base.width * scale);
  const depthCm = Math.round(base.depth * scale);
  const heightCm = Math.round(base.height * scale);

  // More viewpoints, tighter band: one angle leaves depth largely unseen.
  const views = detection.viewpoints.length;
  const tolerance = views >= 3 ? 0.08 : views === 2 ? 0.12 : 0.18;

  const w = widthCm / 100;
  const d = depthCm / 100;
  const h = heightCm / 100;

  return {
    widthCm,
    depthCm,
    heightCm,
    volumeM3: round3(w * d * h),
    surfaceAreaM2: round3(2 * (w * d + w * h + d * h)),
    footprintM2: round3(w * d),
    boundingBox: { widthCm, depthCm, heightCm },
    minCm: {
      width: Math.round(widthCm * (1 - tolerance)),
      depth: Math.round(depthCm * (1 - tolerance)),
      height: Math.round(heightCm * (1 - tolerance)),
    },
    maxCm: {
      width: Math.round(widthCm * (1 + tolerance)),
      depth: Math.round(depthCm * (1 + tolerance)),
      height: Math.round(heightCm * (1 + tolerance)),
    },
    dimensionConfidence: round1(1 - tolerance * 2) === 0 ? 0.5 : Math.round((1 - tolerance * 2) * 100) / 100,
    basis:
      views >= 2
        ? `Typical ${detection.label.toLowerCase()} dimensions, refined across ${views} angles.`
        : `Typical ${detection.label.toLowerCase()} dimensions from a single angle.`,
  };
}
