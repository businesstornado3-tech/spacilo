/**
 * Real-device regression: the initial rear-camera black screen.
 *
 * On a physical phone the first "Start Live Scan" produced a black viewport
 * while the UI claimed "Not ready"; switching to the front camera and back
 * fixed it. These tests lock the corrected lifecycle in place.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  cameraConstraints,
  simpleCameraConstraints,
  CameraController,
} from "@/lib/livescan/camera";
import {
  attachStreamAndAwaitFirstFrame,
  hasUsableFrame,
  type VideoElementLike,
} from "@/lib/livescan/video-ready";
import { canShowCaptureReadiness } from "@/lib/livescan/types";
import { PerformanceGovernor } from "@/lib/livescan/performance";

const read = (path: string) => readFileSync(path, "utf8");
const HOOK = read("src/hooks/useLiveScan.ts");
const UI = read("src/components/spacefit/live/LiveScanner.tsx");

class FakeVideo implements VideoElementLike {
  srcObject: unknown = null;
  videoWidth = 0;
  videoHeight = 0;
  readyState = 0;
  playCalls = 0;
  private listeners = new Map<string, Set<() => void>>();

  play = async () => {
    this.playCalls += 1;
  };

  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  paint(width = 640, height = 480) {
    this.videoWidth = width;
    this.videoHeight = height;
    this.readyState = 2;
    this.emit("loadeddata");
  }
}

const fakeStream = () => ({ getTracks: () => [] }) as unknown as MediaStream;

describe("first-frame readiness", () => {
  it("does not treat a resolved getUserMedia as a ready camera", async () => {
    const video = new FakeVideo();
    const stream = fakeStream();
    const pending = attachStreamAndAwaitFirstFrame(video, stream, { timeoutMs: 50 });
    expect(video.srcObject).toBe(stream);
    expect(hasUsableFrame(video)).toBe(false);
    await expect(pending).resolves.toEqual({ ok: false, code: "no_frame" });
  });

  it("resolves once the element genuinely has sized frame data", async () => {
    const video = new FakeVideo();
    const pending = attachStreamAndAwaitFirstFrame(video, fakeStream(), { timeoutMs: 500 });
    video.paint();
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("explicitly starts playback on the stable element", async () => {
    const video = new FakeVideo();
    const pending = attachStreamAndAwaitFirstFrame(video, fakeStream(), { timeoutMs: 100 });
    await Promise.resolve();
    expect(video.playCalls).toBe(1);
    video.paint();
    await pending;
  });

  it("survives a rejected play() when frames still arrive", async () => {
    const video = new FakeVideo();
    video.play = async () => {
      throw new Error("NotAllowedError");
    };
    const pending = attachStreamAndAwaitFirstFrame(video, fakeStream(), { timeoutMs: 500 });
    video.paint();
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("uses requestVideoFrameCallback when the browser provides it", async () => {
    const video = new FakeVideo() as FakeVideo & VideoElementLike;
    let fire: null | (() => void) = null;
    const setFire = (callback: () => void) => {
      fire = callback;
    };
    (video as VideoElementLike).requestVideoFrameCallback = (callback) => {
      setFire(callback);
      return 1;
    };
    const pending = attachStreamAndAwaitFirstFrame(video, fakeStream(), { timeoutMs: 500 });
    video.videoWidth = 640;
    video.videoHeight = 480;
    video.readyState = 2;
    (fire as null | (() => void))?.();
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("is bounded — it never waits forever on a dead rear stream", async () => {
    const video = new FakeVideo();
    const start = Date.now();
    await attachStreamAndAwaitFirstFrame(video, fakeStream(), { timeoutMs: 30 });
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("rear-camera constraints", () => {
  it("prefers the environment camera with resilient ideal hints", () => {
    const video = cameraConstraints("environment").video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(video.width).toEqual({ ideal: 960, max: 1280 });
    expect(video.height).toEqual({ ideal: 540, max: 720 });
    expect(JSON.stringify(video)).not.toContain("exact");
  });

  it("falls back to the simplest possible rear request on retry", () => {
    const video = simpleCameraConstraints("environment").video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(video.width).toBeUndefined();
    expect(video.frameRate).toBeUndefined();
  });

  it("can pin an enumerated device when one is known", () => {
    const video = simpleCameraConstraints("environment", "rear-1").video as MediaTrackConstraints;
    expect(video.deviceId).toEqual({ exact: "rear-1" });
  });
});

describe("no duplicate media streams", () => {
  it("stops the previous stream before acquiring another", async () => {
    const stopped: string[] = [];
    const makeStream = (id: string) =>
      ({ getTracks: () => [{ stop: () => stopped.push(id) }] }) as unknown as MediaStream;
    let index = 0;
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) =>
      makeStream(`s${(index += 1)}`),
    );
    const controller = new CameraController({ mediaDevices: { getUserMedia } });

    await controller.start("environment");
    await controller.start("environment", { simple: true });
    expect(stopped).toEqual(["s1"]);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const retryConstraints = getUserMedia.mock.calls[1]?.[0] as MediaStreamConstraints;
    expect((retryConstraints.video as MediaTrackConstraints).width).toBeUndefined();

    controller.stop();
    expect(stopped).toEqual(["s1", "s2"]);
  });
});

describe("camera state versus capture readiness", () => {
  it("only permits capture readiness once the camera is ready", () => {
    expect(canShowCaptureReadiness("ready")).toBe(true);
    for (const state of [
      "idle",
      "requesting_permission",
      "opening_camera",
      "waiting_for_first_frame",
      "failed",
    ] as const) {
      expect(canShowCaptureReadiness(state)).toBe(false);
    }
  });

  it("never renders the readiness label before a real frame", () => {
    expect(UI).toMatch(/!cameraReady\s*\n?\s*\?\s*CAMERA_STATE_COPY/);
    expect(UI).toMatch(/CAPTURE_READINESS_LABEL/);
  });

  it("blocks capture until the camera is ready", () => {
    expect(UI).toMatch(/disabled=\{scan\.capturing \|\| !cameraReady\}/);
  });

  it("offers try again, switch camera and upload when the camera fails", () => {
    expect(UI).toMatch(/Try again/);
    expect(UI).toMatch(/Switch camera/);
    expect(UI).toMatch(/Upload photo instead/);
    expect(UI).toMatch(/cameraFailed \? fallback : null/);
  });

  it("keeps a single stable video element across the lifecycle", () => {
    expect(UI.match(/<video\n/g)?.length).toBe(1);
    expect(UI).toMatch(/playsInline/);
    expect(UI).toMatch(/muted/);
    expect(UI).toMatch(/autoPlay/);
    expect(UI).toMatch(/const active = scan\.status !== "idle"/);
  });
});

describe("one unified camera lifecycle", () => {
  it("routes initial start, switch and retry through activateCamera", () => {
    expect(HOOK).toMatch(/const activateCamera = React\.useCallback/);
    for (const caller of ["const start =", "const switchCamera =", "const retry ="]) {
      const body = HOOK.slice(HOOK.indexOf(caller), HOOK.indexOf(caller) + 600);
      expect(body).toMatch(/activateCamera\(/);
    }
    // No second startup implementation may call getUserMedia directly.
    expect(HOOK).not.toMatch(/\.getUserMedia\(/);
  });

  it("waits for a first frame inside the shared activation path", () => {
    expect(HOOK).toMatch(/attachStreamAndAwaitFirstFrame/);
    expect(HOOK).toMatch(/setCameraState\("waiting_for_first_frame"\)/);
    expect(HOOK).toMatch(/setCameraState\("ready"\)/);
  });

  it("recovers a bounded number of times, clearing srcObject between attempts", () => {
    expect(HOOK).toMatch(/MAX_ACTIVATION_ATTEMPTS = 2/);
    expect(HOOK).toMatch(/controller\.stop\(\);\s*\n\s*video\.srcObject = null;/);
    expect(HOOK).toMatch(/setError\("camera_no_frame"\)/);
  });

  it("keeps the user on the environment camera during recovery", () => {
    const activation = HOOK.slice(
      HOOK.indexOf("const activateCamera"),
      HOOK.indexOf("const start ="),
    );
    expect(activation).not.toMatch(/"user"/);
  });

  it("starts the detector only after the camera reports ready", () => {
    const start = HOOK.slice(HOOK.indexOf("const start ="), HOOK.indexOf("const switchCamera ="));
    expect(start.indexOf("activateCamera")).toBeLessThan(start.indexOf("startVision"));
    expect(start).toMatch(/if \(!ok\)/);
    const vision = HOOK.slice(
      HOOK.indexOf("const startVision"),
      HOOK.indexOf("const waitForVideoElement"),
    );
    expect(vision).toMatch(/loadLiveDetector/);
  });
});

describe("both scan journeys share the fixed camera", () => {
  it("renter and host surfaces use the same LiveScanner and hook", () => {
    for (const path of [
      "src/components/inventory/InventoryPhotoManager.tsx",
      "src/components/host/spacefit/SpaceScanner.tsx",
      "src/components/spacefit/GuestScanShell.tsx",
    ]) {
      expect(read(path)).toMatch(/<LiveScanner/);
    }
    expect(UI).toMatch(/useLiveScan/);
  });

  it("leaves the performance governor intact", () => {
    const governor = new PerformanceGovernor("full");
    expect(governor.mode).toBe("full");
    governor.downgrade();
    expect(governor.mode).toBe("reduced");
    governor.downgrade();
    expect(governor.mode).toBe("photo");
    expect(HOOK).toMatch(/PerformanceGovernor/);
  });
});
