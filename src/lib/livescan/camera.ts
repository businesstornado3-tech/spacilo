/**
 * Camera lifecycle.
 *
 * A tiny framework-free controller so camera behaviour can be tested without a
 * DOM: the media API is injected. Rules it enforces:
 *
 *   - the camera NEVER starts on its own; something must call `start()`;
 *   - the rear/environment camera is preferred on mobile;
 *   - every track is stopped on close, unmount or failure;
 *   - failures collapse into non-sensitive application error codes.
 */
import type { LiveScanErrorCode } from "@/lib/livescan/types";

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices?(): Promise<Array<{ kind: string }>>;
}

export type CameraFacing = "environment" | "user";

export type CameraStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; code: LiveScanErrorCode };

export interface CameraPreviewProfile {
  width: number;
  height: number;
  frameRate: number;
}

export interface CameraControllerOptions {
  mediaDevices?: MediaDevicesLike | null;
  facing?: CameraFacing;
  /** Requested preview resolution. Smaller previews keep phones responsive. */
  preview?: CameraPreviewProfile;
}

/** Default preview: deliberately modest, because 1080p previews cause lag. */
export const DEFAULT_PREVIEW_PROFILE: CameraPreviewProfile = {
  width: 960,
  height: 540,
  frameRate: 30,
};

export function cameraConstraints(
  facing: CameraFacing,
  preview: CameraPreviewProfile = DEFAULT_PREVIEW_PROFILE,
): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: preview.width, max: 1280 },
      height: { ideal: preview.height, max: 720 },
      frameRate: { ideal: preview.frameRate, max: 30 },
    },
  };
}

/**
 * Retry constraints: nothing but the facing preference. Some phones negotiate
 * a rear stream that never paints when size/frameRate hints are present, so
 * the recovery attempt asks for as little as possible.
 */
export function simpleCameraConstraints(
  facing: CameraFacing,
  deviceId?: string,
): MediaStreamConstraints {
  return {
    audio: false,
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } },
  };
}


/** Maps a raw media error onto our small, non-sensitive error vocabulary. */
export function cameraErrorCode(error: unknown): LiveScanErrorCode {
  const name = typeof error === "object" && error !== null ? String((error as Error).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "camera_permission_denied";
  return "camera_unavailable";
}

export class CameraController {
  private mediaDevices: MediaDevicesLike | null;
  private stream: MediaStream | null = null;
  private currentFacing: CameraFacing;
  private readonly preview: CameraPreviewProfile;

  constructor(options: CameraControllerOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? null;
    this.currentFacing = options.facing ?? "environment";
    this.preview = options.preview ?? DEFAULT_PREVIEW_PROFILE;
  }

  get active(): boolean {
    return this.stream !== null;
  }

  get facing(): CameraFacing {
    return this.currentFacing;
  }

  get activeStream(): MediaStream | null {
    return this.stream;
  }

  async start(facing: CameraFacing = this.currentFacing): Promise<CameraStartResult> {
    if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== "function") {
      return { ok: false, code: "camera_unavailable" };
    }
    // Never run two streams at once.
    this.stop();
    try {
      const stream = await this.mediaDevices.getUserMedia(cameraConstraints(facing, this.preview));
      this.stream = stream;
      this.currentFacing = facing;
      return { ok: true, stream };
    } catch (error) {
      this.stream = null;
      return { ok: false, code: cameraErrorCode(error) };
    }
  }

  /** Flips between rear and front where the device offers both. */
  async switchCamera(): Promise<CameraStartResult> {
    return this.start(this.currentFacing === "environment" ? "user" : "environment");
  }

  /** Releases the hardware. Safe to call repeatedly. */
  stop(): void {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // A track that is already dead is not an error worth surfacing.
      }
    }
  }
}

/** True when the device reports more than one camera. */
export async function hasMultipleCameras(devices: MediaDevicesLike | null): Promise<boolean> {
  if (!devices?.enumerateDevices) return false;
  try {
    const list = await devices.enumerateDevices();
    return list.filter((device) => device.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}
