/**
 * useLiveScan — the single live-camera hook for BOTH modes and BOTH audiences.
 *
 * Guest renter, guest host, authenticated renter and authenticated host all use
 * this one hook; only `mode` and the capture callback differ. It owns:
 *
 *   camera lifecycle · lazy model load · throttled local inference ·
 *   temporal stabilisation · deterministic guidance · adaptive performance ·
 *   cleanup.
 *
 * It performs NO network calls of any kind. Captured images are handed back to
 * the caller, which feeds them to the existing secure server pipelines.
 *
 * PERFORMANCE CONTRACT: the camera preview outranks every AI effect. Inference
 * runs on a small downscaled tile, never on the full preview frame; only one
 * pass is ever in flight; and the governor steps the experience down to
 * reduced/photo mode rather than letting the preview stutter.
 */
import * as React from "react";

import { CameraController, hasMultipleCameras, type MediaDevicesLike } from "@/lib/livescan/camera";
import { captureFrame } from "@/lib/livescan/capture";
import {
  detectBrowserLiveScanCapability,
  type LiveScanCapability,
} from "@/lib/livescan/capability";
import { loadLiveDetector, type DetectorLoader } from "@/lib/livescan/detector";
import { FrameQualitySampler } from "@/lib/livescan/frame-quality";
import { hostGuidance, objectCoverage, renterGuidance, type LiveGuidance } from "@/lib/livescan/guidance";
import {
  PerformanceGovernor,
  PERFORMANCE_PROFILES,
  inferenceSize,
  type LivePerformanceMode,
} from "@/lib/livescan/performance";
import { InferenceScheduler } from "@/lib/livescan/scheduler";
import { DetectionStabiliser } from "@/lib/livescan/stabiliser";
import type {
  LiveDetector,
  LiveScanErrorCode,
  LiveScanMode,
  StableDetection,
} from "@/lib/livescan/types";

export type LiveScanStatus = "idle" | "starting" | "preparing" | "live" | "error";

const IDLE_GUIDANCE: LiveGuidance = {
  message: "Start the camera when you're ready",
  readiness: "not_ready",
  checks: [],
};

/** Cheap quality-only tile used in reduced mode and before the model loads. */
const QUALITY_EDGE = 128;

export interface UseLiveScanOptions {
  mode: LiveScanMode;
  /** Called with the single captured frame. Owns all server interaction. */
  onCapture: (file: File) => void | Promise<void>;
  /** Injected in tests. */
  mediaDevices?: MediaDevicesLike | null;
  capability?: LiveScanCapability;
  detectorLoader?: DetectorLoader;
  /** Injected in tests; lets a caller pin the starting performance mode. */
  initialPerformanceMode?: LivePerformanceMode;
}

export interface LiveScanState {
  status: LiveScanStatus;
  capability: LiveScanCapability;
  error: LiveScanErrorCode | null;
  detections: StableDetection[];
  /** Pixel size of the frame the detections are expressed in. */
  frameSize: { width: number; height: number };
  guidance: LiveGuidance;
  /** True when the local model is running; false means camera-only guidance. */
  liveVisionActive: boolean;
  performanceMode: LivePerformanceMode;
  canSwitchCamera: boolean;
  capturing: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
  switchCamera: () => Promise<void>;
  capture: () => Promise<void>;
}

function sameDetections(a: StableDetection[], b: StableDetection[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left.id !== right.id || left.confirmed !== right.confirmed) return false;
    for (let axis = 0; axis < 4; axis += 1) {
      // Sub-pixel jitter must not cost a React render.
      if (Math.abs((left.bbox[axis] ?? 0) - (right.bbox[axis] ?? 0)) > 1) return false;
    }
  }
  return true;
}

function sameGuidance(a: LiveGuidance, b: LiveGuidance): boolean {
  if (a.message !== b.message || a.readiness !== b.readiness) return false;
  if (a.checks.length !== b.checks.length) return false;
  return a.checks.every(
    (check, index) => check.label === b.checks[index]?.label && check.met === b.checks[index]?.met,
  );
}

export function useLiveScan(options: UseLiveScanOptions): LiveScanState {
  const {
    mode,
    onCapture,
    mediaDevices,
    capability: injected,
    detectorLoader,
    initialPerformanceMode = "full",
  } = options;

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraRef = React.useRef<CameraController | null>(null);
  const detectorRef = React.useRef<LiveDetector | null>(null);
  const stabiliserRef = React.useRef(new DetectionStabiliser());
  const samplerRef = React.useRef(new FrameQualitySampler());
  const schedulerRef = React.useRef(new InferenceScheduler());
  const governorRef = React.useRef(new PerformanceGovernor(initialPerformanceMode));
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const workCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const activeRef = React.useRef(false);
  const detectionsRef = React.useRef<StableDetection[]>([]);
  const guidanceRef = React.useRef<LiveGuidance>(IDLE_GUIDANCE);
  const frameSizeRef = React.useRef({ width: 0, height: 0 });

  const [capability] = React.useState<LiveScanCapability>(
    () => injected ?? detectBrowserLiveScanCapability(),
  );
  const [status, setStatus] = React.useState<LiveScanStatus>("idle");
  const [error, setError] = React.useState<LiveScanErrorCode | null>(null);
  const [detections, setDetections] = React.useState<StableDetection[]>([]);
  const [frameSize, setFrameSize] = React.useState({ width: 0, height: 0 });
  const [guidance, setGuidance] = React.useState<LiveGuidance>(IDLE_GUIDANCE);
  const [liveVisionActive, setLiveVisionActive] = React.useState(false);
  const [performanceMode, setPerformanceMode] =
    React.useState<LivePerformanceMode>(initialPerformanceMode);
  const [canSwitchCamera, setCanSwitchCamera] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);

  const devices = React.useMemo<MediaDevicesLike | null>(() => {
    if (mediaDevices !== undefined) return mediaDevices;
    if (typeof navigator === "undefined") return null;
    return (navigator.mediaDevices as unknown as MediaDevicesLike | undefined) ?? null;
  }, [mediaDevices]);

  const releaseDetector = React.useCallback(() => {
    detectorRef.current?.dispose();
    detectorRef.current = null;
  }, []);

  /** Full teardown: tracks, model, buffers, loops. Safe to call repeatedly. */
  const stop = React.useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    releaseDetector();
    stabiliserRef.current.reset();
    samplerRef.current.reset();
    schedulerRef.current.reset();
    governorRef.current.reset(initialPerformanceMode);
    if (workCanvasRef.current) {
      workCanvasRef.current.width = 0;
      workCanvasRef.current.height = 0;
      workCanvasRef.current = null;
    }
    detectionsRef.current = [];
    guidanceRef.current = IDLE_GUIDANCE;
    frameSizeRef.current = { width: 0, height: 0 };
    setDetections([]);
    setFrameSize({ width: 0, height: 0 });
    setGuidance(IDLE_GUIDANCE);
    setLiveVisionActive(false);
    setPerformanceMode(initialPerformanceMode);
    setStatus("idle");
  }, [initialPerformanceMode, releaseDetector]);

  /**
   * One inference pass over a SMALL copy of the current frame. The detector
   * never sees the full-resolution preview: that is what made phones crawl.
   */
  const runPass = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const governor = governorRef.current;
    const detector = governor.mode === "full" ? detectorRef.current : null;
    const edge = detector ? governor.profile.inferenceEdge : QUALITY_EDGE;
    const size = inferenceSize(video.videoWidth, video.videoHeight, edge);
    if (size.width === 0) return;

    const canvas = (workCanvasRef.current ??= document.createElement("canvas"));
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, size.width, size.height);
    const pixels = context.getImageData(0, 0, size.width, size.height).data;
    const quality = samplerRef.current.sample(pixels, size.width, size.height);

    let stable: StableDetection[] = detector ? stabiliserRef.current.visible() : [];
    if (detector) {
      // Detection runs on the downscaled tile, so boxes are in tile pixels.
      const raw = await detector.detect(canvas);
      stable = stabiliserRef.current.update(raw, Date.now());
    }

    if (
      frameSizeRef.current.width !== size.width ||
      frameSizeRef.current.height !== size.height
    ) {
      frameSizeRef.current = size;
      setFrameSize(size);
    }
    if (!sameDetections(detectionsRef.current, stable)) {
      detectionsRef.current = stable;
      setDetections(stable);
    }

    const next =
      mode === "renter"
        ? renterGuidance(stable, quality)
        : hostGuidance({
            quality,
            detections: stable,
            objectCoverage: objectCoverage(stable, size.width, size.height),
          });
    if (!sameGuidance(guidanceRef.current, next)) {
      guidanceRef.current = next;
      setGuidance(next);
    }
  }, [mode]);

  const tick = React.useCallback(() => {
    if (!activeRef.current) return;
    const scheduler = schedulerRef.current;
    const governor = governorRef.current;
    const now = Date.now();

    if (scheduler.shouldRun(now)) {
      // begin() latches an in-flight flag, so passes can never overlap.
      scheduler.begin(now);
      void runPass()
        .catch(() => {
          // A throwing detector is a performance/compat problem, not a scan
          // failure: step down rather than fight it.
          if (governor.downgrade()) {
            releaseDetector();
            setLiveVisionActive(false);
            setPerformanceMode(governor.mode);
          }
        })
        .finally(() => {
          const duration = Date.now() - now;
          scheduler.end(duration);
          if (governor.record(duration)) {
            if (governor.mode !== "full") {
              releaseDetector();
              setLiveVisionActive(false);
            }
            setPerformanceMode(governor.mode);
            if (governor.mode === "photo") {
              // Camera stays live; the live loop stops entirely.
              activeRef.current = true;
              detectionsRef.current = [];
              setDetections([]);
              return;
            }
          }
          if (activeRef.current && governor.mode !== "photo") {
            timerRef.current = setTimeout(
              tick,
              Math.max(scheduler.intervalMs, governor.profile.intervalMs),
            );
          }
        });
      return;
    }
    timerRef.current = setTimeout(tick, scheduler.intervalMs);
  }, [releaseDetector, runPass]);

  const start = React.useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setStatus("starting");

    const governor = governorRef.current;
    governor.reset(initialPerformanceMode);
    setPerformanceMode(governor.mode);

    const controller = new CameraController({
      mediaDevices: devices,
      preview: PERFORMANCE_PROFILES[governor.mode].preview,
    });
    cameraRef.current = controller;
    const result = await controller.start("environment");
    if (!result.ok) {
      cameraRef.current = null;
      setError(result.code);
      setStatus("error");
      return;
    }

    activeRef.current = true;
    if (videoRef.current) {
      videoRef.current.srcObject = result.stream;
      void videoRef.current.play?.().catch(() => undefined);
    }
    void hasMultipleCameras(devices).then((multiple) => {
      if (activeRef.current) setCanSwitchCamera(multiple);
    });

    if (!capability.liveVision || governor.mode !== "full") {
      // Camera-only: still a real live viewport, just without local detection.
      if (!capability.liveVision) {
        governor.forceMode("reduced");
        setPerformanceMode(governor.mode);
      }
      setStatus("live");
      setLiveVisionActive(false);
      tick();
      return;
    }

    setStatus("preparing");
    try {
      detectorRef.current = await loadLiveDetector(detectorLoader);
      if (!activeRef.current) {
        releaseDetector();
        return;
      }
      setLiveVisionActive(true);
    } catch {
      // Live guidance is optional — never break the scan over it.
      detectorRef.current = null;
      setLiveVisionActive(false);
      governor.forceMode("reduced");
      setPerformanceMode(governor.mode);
      setError("live_model_load_failed");
    }
    setStatus("live");
    tick();
  }, [
    capability.liveVision,
    detectorLoader,
    devices,
    initialPerformanceMode,
    releaseDetector,
    tick,
  ]);

  const switchCamera = React.useCallback(async () => {
    const controller = cameraRef.current;
    if (!controller) return;
    const result = await controller.switchCamera();
    if (!result.ok) {
      setError(result.code);
      return;
    }
    if (videoRef.current) videoRef.current.srcObject = result.stream;
  }, []);

  const capture = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    try {
      const result = await captureFrame(video);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await onCapture(result.file);
    } finally {
      setCapturing(false);
    }
  }, [onCapture]);

  // Pause detection in a hidden tab; resume when the scan comes back.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      schedulerRef.current.setHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Unmount (including route navigation) must release the hardware.
  React.useEffect(() => stop, [stop]);

  return {
    status,
    capability,
    error,
    detections,
    frameSize,
    guidance,
    liveVisionActive,
    performanceMode,
    canSwitchCamera,
    capturing,
    videoRef,
    start,
    stop,
    switchCamera,
    capture,
  };
}
