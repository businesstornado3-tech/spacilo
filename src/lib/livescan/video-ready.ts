/**
 * First-frame readiness.
 *
 * A resolved `getUserMedia()` promise is NOT a working camera. On real phones
 * the rear camera routinely resolves a stream that has not yet produced a
 * single frame, which is exactly how a black viewport happens.
 *
 * This module owns the one definition of "the camera is genuinely showing
 * something": the stream is attached to the live <video> element, playback has
 * been asked for, metadata has arrived with non-zero dimensions, and — where
 * the browser supports it — a real frame has been delivered.
 *
 * Framework-free and injectable so the lifecycle is fully testable.
 */

export interface VideoElementLike {
  srcObject: unknown;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
  play?: () => Promise<void> | void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export type FirstFrameResult = { ok: true } | { ok: false; code: "no_frame" };

export interface AwaitFirstFrameOptions {
  /** Bounded wait: a camera that hasn't drawn by now is not going to. */
  timeoutMs?: number;
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/** HTMLMediaElement.HAVE_CURRENT_DATA */
export const HAVE_CURRENT_DATA = 2;

/** True when the element already holds a usable, sized frame. */
export function hasUsableFrame(video: VideoElementLike): boolean {
  return video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HAVE_CURRENT_DATA;
}

/**
 * Attaches `stream` to `video` and resolves only once a genuine frame exists.
 * The SAME function serves initial start and camera switching — there is
 * deliberately no second startup path.
 */
export async function attachStreamAndAwaitFirstFrame(
  video: VideoElementLike,
  stream: MediaStream,
  options: AwaitFirstFrameOptions = {},
): Promise<FirstFrameResult> {
  const {
    timeoutMs = 4000,
    setTimeoutFn = (callback, ms) => setTimeout(callback, ms),
    clearTimeoutFn = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  video.srcObject = stream;
  // iOS Safari needs an explicit play() even with autoplay+muted+playsinline.
  try {
    await video.play?.();
  } catch {
    // A rejected play() is not fatal on its own; the frame check decides.
  }

  if (hasUsableFrame(video)) return { ok: true };

  return new Promise<FirstFrameResult>((resolve) => {
    let settled = false;
    let frameHandle: number | null = null;
    let timer: unknown = null;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onProgress);
      video.removeEventListener("loadeddata", onProgress);
      video.removeEventListener("canplay", onProgress);
      video.removeEventListener("playing", onProgress);
      if (frameHandle !== null) video.cancelVideoFrameCallback?.(frameHandle);
      if (timer !== null) clearTimeoutFn(timer);
    };

    const settle = (result: FirstFrameResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    function onProgress() {
      if (hasUsableFrame(video)) settle({ ok: true });
    }

    video.addEventListener("loadedmetadata", onProgress);
    video.addEventListener("loadeddata", onProgress);
    video.addEventListener("canplay", onProgress);
    video.addEventListener("playing", onProgress);

    // Strongest signal where available: a frame was actually presented.
    if (typeof video.requestVideoFrameCallback === "function") {
      frameHandle = video.requestVideoFrameCallback(() => {
        frameHandle = null;
        if (video.videoWidth > 0 && video.videoHeight > 0) settle({ ok: true });
        else onProgress();
      });
    }

    timer = setTimeoutFn(() => {
      settle(hasUsableFrame(video) ? { ok: true } : { ok: false, code: "no_frame" });
    }, timeoutMs);
  });
}
