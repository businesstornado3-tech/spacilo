/**
 * Adaptive performance modes.
 *
 * The camera preview always has priority over AI effects. A device that can
 * open a camera must never be forced into a laggy Live Scan, so the runtime
 * measures how expensive each inference pass actually is and steps DOWN when
 * the device cannot keep up:
 *
 *   full    — local detection + overlays + guidance
 *   reduced — no detection; cheap frame-quality guidance at a slow cadence
 *   photo   — no live loop at all; plain camera preview + capture/upload
 *
 * Pure and framework-free so it is fully testable: no timers, no DOM.
 */

export type LivePerformanceMode = "full" | "reduced" | "photo";

export interface PerformanceProfile {
  /** Preview capture resolution requested from the camera. */
  preview: { width: number; height: number; frameRate: number };
  /** Longest edge of the tile actually fed to the detector. */
  inferenceEdge: number;
  /** Target gap between inference passes. */
  intervalMs: number;
}

/**
 * Preview stays modest on purpose: 1280x720 at 30fps is far more pixels than a
 * phone-sized viewport needs and is the single biggest cause of preview lag
 * once a detector shares the GPU.
 */
export const PERFORMANCE_PROFILES: Record<LivePerformanceMode, PerformanceProfile> = {
  full: {
    preview: { width: 960, height: 540, frameRate: 30 },
    inferenceEdge: 256,
    intervalMs: 350,
  },
  reduced: {
    preview: { width: 640, height: 360, frameRate: 24 },
    inferenceEdge: 160,
    intervalMs: 900,
  },
  photo: {
    preview: { width: 640, height: 360, frameRate: 24 },
    inferenceEdge: 0,
    intervalMs: 0,
  },
};

export const PERFORMANCE_MODE_COPY: Record<LivePerformanceMode, string> = {
  full: "Live guidance on",
  reduced: "Simplified live guidance — keeping the camera smooth",
  photo: "Camera only — take a photo for SpaceFit analysis",
};

export interface PerformanceGovernorOptions {
  /** A pass slower than this is a sign the device is struggling. */
  slowPassMs: number;
  /** A pass slower than this is unacceptable on any device. */
  criticalPassMs: number;
  /** Consecutive slow passes tolerated before stepping down. */
  slowPassesBeforeDowngrade: number;
}

export const DEFAULT_GOVERNOR_OPTIONS: PerformanceGovernorOptions = {
  slowPassMs: 400,
  criticalPassMs: 1200,
  slowPassesBeforeDowngrade: 3,
};

/**
 * Watches inference cost and only ever steps DOWN. Recovering upwards mid-scan
 * would make the preview oscillate, which reads as "broken" on a phone.
 */
export class PerformanceGovernor {
  private readonly options: PerformanceGovernorOptions;
  private currentMode: LivePerformanceMode;
  private consecutiveSlow = 0;

  constructor(
    initialMode: LivePerformanceMode = "full",
    options: Partial<PerformanceGovernorOptions> = {},
  ) {
    this.currentMode = initialMode;
    this.options = { ...DEFAULT_GOVERNOR_OPTIONS, ...options };
  }

  get mode(): LivePerformanceMode {
    return this.currentMode;
  }

  get profile(): PerformanceProfile {
    return PERFORMANCE_PROFILES[this.currentMode];
  }

  /** Records a completed pass. Returns true when the mode changed. */
  record(durationMs: number): boolean {
    if (this.currentMode === "photo") return false;

    if (durationMs >= this.options.criticalPassMs) {
      this.consecutiveSlow = 0;
      return this.downgrade();
    }
    if (durationMs >= this.options.slowPassMs) {
      this.consecutiveSlow += 1;
      if (this.consecutiveSlow >= this.options.slowPassesBeforeDowngrade) {
        this.consecutiveSlow = 0;
        return this.downgrade();
      }
      return false;
    }
    this.consecutiveSlow = 0;
    return false;
  }

  /** Any hard failure (model load, inference throw) drops a level immediately. */
  downgrade(): boolean {
    if (this.currentMode === "full") {
      this.currentMode = "reduced";
      return true;
    }
    if (this.currentMode === "reduced") {
      this.currentMode = "photo";
      return true;
    }
    return false;
  }

  /** Used when the device can't run a model at all. */
  forceMode(mode: LivePerformanceMode): boolean {
    if (this.currentMode === mode) return false;
    this.currentMode = mode;
    this.consecutiveSlow = 0;
    return true;
  }

  reset(mode: LivePerformanceMode = "full"): void {
    this.currentMode = mode;
    this.consecutiveSlow = 0;
  }
}

/** Fits a source frame inside `edge` for inference, never upscaling. */
export function inferenceSize(
  videoWidth: number,
  videoHeight: number,
  edge: number,
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0 || edge <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(videoWidth, videoHeight));
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}
