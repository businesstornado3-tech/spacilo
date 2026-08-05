/**
 * Intentional capture.
 *
 * ONE frame, captured only when a person presses the shutter, converted to a
 * normal JPEG File so it can enter the EXISTING upload/analysis pipelines
 * unchanged. Preview frames are never turned into files.
 */
import type { LiveScanErrorCode } from "@/lib/livescan/types";

export interface CaptureOptions {
  /** Longest edge of the captured image, in pixels. */
  maxEdge?: number;
  quality?: number;
  fileName?: string;
}

export type CaptureResult = { ok: true; file: File } | { ok: false; code: LiveScanErrorCode };

/** Fits a frame inside `maxEdge` without upscaling. */
export function captureDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function captureFrame(
  video: HTMLVideoElement,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const { maxEdge = 1600, quality = 0.9, fileName = "spacefit-live-capture.jpg" } = options;
  const source = { width: video.videoWidth, height: video.videoHeight };
  const size = captureDimensions(source.width, source.height, maxEdge);
  if (size.width === 0 || size.height === 0) return { ok: false, code: "capture_failed" };

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, code: "capture_failed" };

  try {
    context.drawImage(video, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/jpeg", quality),
    );
    if (!blob) return { ok: false, code: "capture_failed" };
    return { ok: true, file: new File([blob], fileName, { type: "image/jpeg" }) };
  } catch {
    return { ok: false, code: "capture_failed" };
  } finally {
    // Release the backing buffer immediately; nothing is kept after capture.
    canvas.width = 0;
    canvas.height = 0;
  }
}
