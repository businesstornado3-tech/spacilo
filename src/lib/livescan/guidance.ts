/**
 * Deterministic live guidance.
 *
 * Every sentence a person sees during a live scan is produced here, from local
 * signals only. No model call, no network, no randomness — the same inputs
 * always produce the same guidance.
 *
 * Host guidance deliberately talks about FRAMING QUALITY, never about
 * measurement confidence: a plain RGB camera cannot know metres.
 */
import { QUALITY_THRESHOLDS } from "@/lib/livescan/frame-quality";
import type { CaptureReadiness, FrameQuality, StableDetection } from "@/lib/livescan/types";

export interface LiveGuidance {
  /** The single sentence shown under the viewport. */
  message: string;
  readiness: CaptureReadiness;
  /** Short textual facts, so the UX never depends on coloured boxes alone. */
  checks: Array<{ label: string; met: boolean }>;
}

function lightingChecks(quality: FrameQuality) {
  return {
    lit: quality.brightness >= QUALITY_THRESHOLDS.darkBelow,
    notBlown: quality.brightness <= QUALITY_THRESHOLDS.brightAbove,
    sharp: quality.sharpness >= QUALITY_THRESHOLDS.blurryBelow,
    steady: quality.motion <= QUALITY_THRESHOLDS.movingAbove,
  };
}

/* -------------------------------------------------------------- renter */

export function renterGuidance(
  detections: StableDetection[],
  quality: FrameQuality,
): LiveGuidance {
  const { lit, notBlown, sharp, steady } = lightingChecks(quality);
  const confirmed = detections.filter((detection) => detection.confirmed);

  const checks = [
    { label: "Enough light", met: lit && notBlown },
    { label: "Steady view", met: steady },
    { label: "Something recognisable in view", met: detections.length > 0 },
  ];

  if (!lit) {
    return { message: "Try a little more light", readiness: "not_ready", checks };
  }
  if (!steady) {
    return { message: "Move slowly so we can see your stuff", readiness: "improving", checks };
  }
  if (!sharp) {
    return { message: "Hold still — the view is a little blurry", readiness: "improving", checks };
  }
  if (detections.length === 0) {
    return { message: "Point at the things you want to store", readiness: "improving", checks };
  }
  if (confirmed.length === 0) {
    return { message: "Show the whole item so we can see it clearly", readiness: "improving", checks };
  }
  return { message: "Good view — ready to capture", readiness: "ready", checks };
}

/* ---------------------------------------------------------------- host */

/**
 * What the local layer can honestly say about a room. Coverage is a framing
 * heuristic (how much of the frame is unobstructed by detected objects), NOT a
 * claim about geometry.
 */
export interface HostSceneSignals {
  quality: FrameQuality;
  /** Detections that plausibly indicate a fixed obstruction. */
  detections: StableDetection[];
  /** 0–1 share of the frame covered by detected objects. */
  objectCoverage: number;
}

/** Detected classes that usually mean something permanent is in the way. */
const POSSIBLE_OBSTRUCTIONS: Record<string, string> = {
  refrigerator: "Large appliance",
  oven: "Large appliance",
  couch: "Furniture",
  bed: "Furniture",
  "dining table": "Furniture",
  bicycle: "Bicycle",
  chair: "Furniture",
};

export function hostPossibleObstructions(detections: StableDetection[]): string[] {
  const labels = new Set<string>();
  for (const detection of detections) {
    const label = POSSIBLE_OBSTRUCTIONS[detection.rawClass];
    if (label && detection.confirmed) labels.add(label);
  }
  return [...labels];
}

/** Share of the frame covered by detected boxes, clamped to 0–1. */
export function objectCoverage(
  detections: StableDetection[],
  frameWidth: number,
  frameHeight: number,
): number {
  const area = frameWidth * frameHeight;
  if (area <= 0) return 0;
  const covered = detections.reduce(
    (total, detection) => total + Math.max(0, detection.bbox[2]) * Math.max(0, detection.bbox[3]),
    0,
  );
  return Math.min(1, covered / area);
}

export function hostGuidance(signals: HostSceneSignals): LiveGuidance {
  const { lit, notBlown, sharp, steady } = lightingChecks(signals.quality);
  const blocked = signals.objectCoverage > 0.55;

  const checks = [
    { label: "Enough light", met: lit && notBlown },
    { label: "Steady view", met: steady },
    { label: "Sharp enough to analyse", met: sharp },
    { label: "Space mostly clear in frame", met: !blocked },
  ];

  if (!lit) return { message: "Lighting is too low", readiness: "not_ready", checks };
  if (!notBlown) {
    return { message: "It's very bright — try a different angle", readiness: "improving", checks };
  }
  if (!steady) return { message: "Move slowly", readiness: "improving", checks };
  if (!sharp) {
    return { message: "Hold still so the photo isn't blurry", readiness: "improving", checks };
  }
  if (blocked) {
    return { message: "Space is partially blocked — show more floor", readiness: "improving", checks };
  }
  return {
    message: "Good angle — point towards a corner and capture",
    readiness: "ready",
    checks,
  };
}

/**
 * Guidance for a re-shoot after a weak post-capture result. Deterministic and
 * shared by guest and authenticated hosts.
 */
export const HOST_RESHOOT_TIPS = [
  "Stand in the doorway or a corner so the floor and two walls are visible",
  "Turn the lights on and move anything blocking the walls",
  "Step back far enough to include the whole space",
] as const;
