/**
 * Live Scan capability detection.
 *
 * Three capabilities are deliberately separate, because a device can have one
 * without the others:
 *
 *   camera            — getUserMedia is usable at all
 *   liveVision        — a local detection model can plausibly run
 *   metricMeasurement — a defensible real-world SCALE source exists
 *
 * A monocular RGB webcam knows nothing about metres, so `metricMeasurement` is
 * false unless a real depth/AR source reports itself. We never fabricate one.
 */

export interface LiveScanCapabilityInput {
  mediaDevices?: { getUserMedia?: unknown; enumerateDevices?: unknown } | undefined;
  isSecureContext?: boolean;
  /** Result of a cheap WebGL/WebGPU probe, injected so this stays pure. */
  hasAcceleratedGraphics?: boolean;
  /** True when WebAssembly is available for the model runtime fallback. */
  hasWebAssembly?: boolean;
  /** Approximate device memory in GB, when the browser reports it. */
  deviceMemoryGb?: number | undefined;
  /**
   * A depth/AR scale provider that has positively identified itself. Nothing in
   * the current browser stack sets this, so live metres stay off by default.
   */
  metricScaleSource?: string | null;
}

export interface LiveScanCapability {
  camera: boolean;
  liveVision: boolean;
  metricMeasurement: boolean;
  /** Non-sensitive reason the richer capabilities are unavailable. */
  reason: "ok" | "insecure_context" | "no_camera_api" | "no_model_runtime" | "low_memory";
  /** Present only when live metric measurement is genuinely available. */
  metricScaleSource: string | null;
}

/** Devices below this reported memory get camera + capture, but no live model. */
export const MIN_LIVE_VISION_MEMORY_GB = 2;

export function detectLiveScanCapability(input: LiveScanCapabilityInput): LiveScanCapability {
  const secure = input.isSecureContext !== false;
  const camera = secure && typeof input.mediaDevices?.getUserMedia === "function";

  const runtime = Boolean(input.hasAcceleratedGraphics || input.hasWebAssembly);
  const memoryOk =
    input.deviceMemoryGb === undefined || input.deviceMemoryGb >= MIN_LIVE_VISION_MEMORY_GB;

  const liveVision = camera && runtime && memoryOk;

  const scale = input.metricScaleSource?.trim() ? input.metricScaleSource.trim() : null;

  const reason: LiveScanCapability["reason"] = !secure
    ? "insecure_context"
    : !camera
      ? "no_camera_api"
      : !runtime
        ? "no_model_runtime"
        : !memoryOk
          ? "low_memory"
          : "ok";

  return {
    camera,
    liveVision,
    // Metric scale requires BOTH a live view and a declared scale source.
    metricMeasurement: liveVision && scale !== null,
    reason,
    metricScaleSource: liveVision && scale !== null ? scale : null,
  };
}

/** Reads the capability from the real browser environment (client only). */
export function detectBrowserLiveScanCapability(): LiveScanCapability {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return detectLiveScanCapability({ mediaDevices: undefined, isSecureContext: false });
  }

  let accelerated = false;
  try {
    const canvas = document.createElement("canvas");
    accelerated = Boolean(
      canvas.getContext("webgl2") ??
        canvas.getContext("webgl") ??
        (typeof (window as { WebGLRenderingContext?: unknown }).WebGLRenderingContext !==
        "undefined"
          ? null
          : null),
    );
  } catch {
    accelerated = false;
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  return detectLiveScanCapability({
    mediaDevices: navigator.mediaDevices as unknown as LiveScanCapabilityInput["mediaDevices"],
    isSecureContext: window.isSecureContext,
    hasAcceleratedGraphics: accelerated,
    hasWebAssembly: typeof WebAssembly !== "undefined",
    deviceMemoryGb: memory,
    // No browser API today gives a trustworthy absolute scale for a room.
    metricScaleSource: null,
  });
}
