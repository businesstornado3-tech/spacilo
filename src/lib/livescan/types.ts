/**
 * SpaceFit Live Scan — shared types.
 *
 * Live Scan is a progressive enhancement in FRONT of the existing capture →
 * server AI pipeline. Nothing in this folder talks to Gemini, Supabase or any
 * network service: live understanding is local, provisional and disposable.
 *
 * LIVE VISION GUIDES. AI PROPOSES. USERS VERIFY. DETERMINISTIC LOGIC DECIDES.
 */
import type { ItemCategory } from "@/lib/inventory-model";

export type LiveScanMode = "renter" | "host";

/** Application-level failure categories. Never carries technical detail. */
export type LiveScanErrorCode =
  | "camera_permission_denied"
  | "camera_unavailable"
  | "camera_no_frame"
  | "live_model_load_failed"
  | "live_model_unsupported"
  | "capture_failed"
  | "post_capture_analysis_failed";

export const LIVE_SCAN_ERROR_COPY: Record<LiveScanErrorCode, string> = {
  camera_permission_denied:
    "We don't have camera access. You can still take or upload a photo for SpaceFit analysis.",
  camera_unavailable:
    "We couldn't open a camera on this device. You can still take or upload a photo.",
  camera_no_frame:
    "We couldn't start the back camera. Try again, switch camera, or upload a photo instead.",
  live_model_load_failed:
    "Live guidance isn't available right now, but you can still take a photo for SpaceFit analysis.",
  live_model_unsupported:
    "Live guidance isn't available on this device, but you can still take a photo for SpaceFit analysis.",
  capture_failed: "We couldn't capture that frame. Please try again.",
  post_capture_analysis_failed:
    "SpaceFit AI couldn't finish that scan. Please try again, or enter the details yourself.",
};

/** [x, y, width, height] in source-pixel coordinates. */
export type BoundingBox = [number, number, number, number];

/** A single raw frame detection, as produced by the local model. */
export interface RawDetection {
  /** The model's own class name, before any SpaceFit mapping. */
  class: string;
  score: number;
  bbox: BoundingBox;
}

/** A detection that has survived temporal stabilisation. */
export interface StableDetection {
  /** Stable track id — the same physical object keeps the same id. */
  id: string;
  /** Raw model class, kept for debugging and taxonomy tests. */
  rawClass: string;
  /** Human label shown over the viewport. */
  label: string;
  /** SpaceFit inventory category, or null when the class isn't mappable. */
  category: ItemCategory | null;
  /** Catalogue key when the class maps to a known catalogue item. */
  catalogueKey: string | null;
  score: number;
  bbox: BoundingBox;
  /** Frames this track has been confirmed on. */
  frames: number;
  /** True once the track is confident enough to show without hedging. */
  confirmed: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
}

/** Minimal contract every local detector must satisfy. */
export interface LiveDetector {
  detect(source: CanvasImageSource, maxResults?: number): Promise<RawDetection[]>;
  dispose(): void;
}

/** Frame quality signals derived locally from a downscaled preview frame. */
export interface FrameQuality {
  /** 0–1 mean luminance. */
  brightness: number;
  /** 0–1 normalised detail/edge energy — a blur proxy. */
  sharpness: number;
  /** 0–1 change since the previous sample — a motion proxy. */
  motion: number;
}

/**
 * Camera lifecycle, kept strictly separate from capture readiness. A black
 * viewport is a CAMERA state, never a "not ready to capture" state.
 */
export type CameraLifecycleState =
  | "idle"
  | "requesting_permission"
  | "opening_camera"
  | "waiting_for_first_frame"
  | "ready"
  | "failed";

/** Capture readiness may only be shown once the camera state is "ready". */
export function canShowCaptureReadiness(state: CameraLifecycleState): boolean {
  return state === "ready";
}

export type CaptureReadiness = "not_ready" | "improving" | "ready";

export const CAPTURE_READINESS_LABEL: Record<CaptureReadiness, string> = {
  not_ready: "Not ready",
  improving: "Improving…",
  ready: "Ready to capture",
};
