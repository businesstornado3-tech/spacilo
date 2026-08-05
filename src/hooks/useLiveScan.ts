/**
 * useLiveScan — the single live-camera hook for BOTH modes and BOTH audiences.
 *
 * Guest renter, guest host, authenticated renter and authenticated host all use
 * this one hook; only `mode` and the capture callback differ. It owns:
 *
 *   camera lifecycle · lazy model load · throttled local inference ·
 *   temporal stabilisation · deterministic guidance · cleanup.
 *
 * It performs NO network calls of any kind. Captured images are handed back to
 * the caller, which feeds them to the existing secure server pipelines.
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

export interface UseLiveScanOptions {
  mode: LiveScanMode;
  /** Called with the single captured frame. Owns all server interaction. */
  onCapture: (file: File) => void | Promise<void>;
  /** Injected in tests. */
  mediaDevices?: MediaDevicesLike | null;
  capability?: LiveScanCapability;
  detectorLoader?: DetectorLoader;
}

export interface LiveScanState {
  status: LiveScanStatus;
  capability: LiveScanCapability;
  error: LiveScanErrorCode | null;
  detections: StableDetection[];
  guidance: LiveGuidance;
  /** True when the local model is running; false means camera-only guidance. */
  liveVisionActive: boolean;
  canSwitchCamera: boolean;
  capturing: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
  switchCamera: () => Promise<void>;
  capture: () => Promise<void>;
}

export function useLiveScan(options: UseLiveScanOptions): LiveScanState {
  const { mode, onCapture, mediaDevices, capability: injected, detectorLoader } = options;

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cameraRef = React.useRef<CameraController | null>(null);
  const detectorRef = React.useRef<LiveDetector | null>(null);
  const stabiliserRef = React.useRef(new DetectionStabiliser());
  const samplerRef = React.useRef(new FrameQualitySampler());
  const schedulerRef = React.useRef(new InferenceScheduler());
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const workCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const activeRef = React.useRef(false);

  const [capability] = React.useState<LiveScanCapability>(
    () => injected ?? detectBrowserLiveScanCapability(),
  );
  const [status, setStatus] = React.useState<LiveScanStatus>("idle");
  const [error, setError] = React.useState<LiveScanErrorCode | null>(null);
  const [detections, setDetections] = React.useState<StableDetection[]>([]);
  const [guidance, setGuidance] = React.useState<LiveGuidance>(IDLE_GUIDANCE);
  const [liveVisionActive, setLiveVisionActive] = React.useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);

  const devices = React.useMemo<MediaDevicesLike | null>(() => {
    if (mediaDevices !== undefined) return mediaDevices;
    if (typeof navigator === "undefined") return null;
    return (navigator.mediaDevices as unknown as MediaDevicesLike | undefined) ?? null;
  }, [mediaDevices]);

  /** Full teardown: tracks, model, buffers, loops. Safe to call repeatedly. */
  const stop = React.useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current?.dispose();
    detectorRef.current = null;
    stabiliserRef.current.reset();
    samplerRef.current.reset();
    schedulerRef.current.reset();
    if (workCanvasRef.current) {
      workCanvasRef.current.width = 0;
      workCanvasRef.current.height = 0;
      workCanvasRef.current = null;
    }
    setDetections([]);
    setGuidance(IDLE_GUIDANCE);
    setLiveVisionActive(false);
    setStatus("idle");
  }, []);

  // One inference pass over a small copy of the current frame.
  const runPass = React.useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = (workCanvasRef.current ??= document.createElement("canvas"));
    const width = 224;
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const quality = samplerRef.current.sample(pixels, width, height);

    let stable: StableDetection[] = stabiliserRef.current.visible();
    if (detector) {
      const raw = await detector.detect(video);
      stable = stabiliserRef.current.update(raw, Date.now());
    }

    setDetections(stable);
    setGuidance(
      mode === "renter"
        ? renterGuidance(stable, quality)
        : hostGuidance({
            quality,
            detections: stable,
            objectCoverage: objectCoverage(stable, video.videoWidth, video.videoHeight),
          }),
    );
  }, [mode]);

  const tick = React.useCallback(() => {
    if (!activeRef.current) return;
    const scheduler = schedulerRef.current;
    const now = Date.now();
    if (scheduler.shouldRun(now)) {
      scheduler.begin(now);
      void runPass()
        .catch(() => undefined)
        .finally(() => {
          scheduler.end(Date.now() - now);
          if (activeRef.current) {
            timerRef.current = setTimeout(tick, scheduler.intervalMs);
          }
        });
      return;
    }
    timerRef.current = setTimeout(tick, scheduler.intervalMs);
  }, [runPass]);

  const start = React.useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setStatus("starting");

    const controller = new CameraController({ mediaDevices: devices });
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

    if (!capability.liveVision) {
      // Camera-only: still a real live viewport, just without local detection.
      setStatus("live");
      setLiveVisionActive(false);
      tick();
      return;
    }

    setStatus("preparing");
    try {
      detectorRef.current = await loadLiveDetector(detectorLoader);
      if (!activeRef.current) {
        detectorRef.current.dispose();
        detectorRef.current = null;
        return;
      }
      setLiveVisionActive(true);
    } catch {
      // Live guidance is optional — never break the scan over it.
      detectorRef.current = null;
      setLiveVisionActive(false);
      setError("live_model_load_failed");
    }
    setStatus("live");
    tick();
  }, [capability.liveVision, detectorLoader, devices, tick]);

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
    guidance,
    liveVisionActive,
    canSwitchCamera,
    capturing,
    videoRef,
    start,
    stop,
    switchCamera,
    capture,
  };
}
