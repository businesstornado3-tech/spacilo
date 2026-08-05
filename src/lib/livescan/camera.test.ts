/**
 * Camera lifecycle behaviour.
 *
 * The camera must never start on its own, must prefer the rear camera, must
 * release every track on close, and must degrade into a safe error code rather
 * than an exception.
 */
import { describe, expect, it, vi } from "vitest";

import {
  CameraController,
  cameraConstraints,
  cameraErrorCode,
  hasMultipleCameras,
} from "@/lib/livescan/camera";

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return {
    tracks,
    stream: { getTracks: () => tracks } as unknown as MediaStream,
  };
}

function fakeDevices(stream: MediaStream) {
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
  return { getUserMedia, devices: { getUserMedia } };
}

describe("camera constraints", () => {
  it("asks for the rear camera by default", () => {
    const video = cameraConstraints("environment").video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
  });

  it("never requests audio", () => {
    expect(cameraConstraints("user").audio).toBe(false);
  });
});

describe("camera error mapping", () => {
  it("maps a permission refusal", () => {
    expect(cameraErrorCode({ name: "NotAllowedError" })).toBe("camera_permission_denied");
  });

  it("maps an insecure context refusal", () => {
    expect(cameraErrorCode({ name: "SecurityError" })).toBe("camera_permission_denied");
  });

  it("maps everything else to unavailable", () => {
    expect(cameraErrorCode({ name: "NotFoundError" })).toBe("camera_unavailable");
    expect(cameraErrorCode("boom")).toBe("camera_unavailable");
  });
});

describe("CameraController", () => {
  it("does not touch the camera until start is called", () => {
    const { stream } = fakeStream();
    const { getUserMedia, devices } = fakeDevices(stream);
    const controller = new CameraController({ mediaDevices: devices });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(controller.active).toBe(false);
  });

  it("starts the rear camera on explicit action", async () => {
    const { stream } = fakeStream();
    const { getUserMedia, devices } = fakeDevices(stream);
    const controller = new CameraController({ mediaDevices: devices });

    const result = await controller.start();
    expect(result.ok).toBe(true);
    expect(controller.active).toBe(true);
    const constraints = getUserMedia.mock.calls[0]![0] as MediaStreamConstraints;
    expect((constraints.video as MediaTrackConstraints).facingMode).toEqual({
      ideal: "environment",
    });
  });

  it("falls back safely when permission is denied", async () => {
    const devices = {
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      }),
    };
    const controller = new CameraController({ mediaDevices: devices });
    const result = await controller.start();
    expect(result).toEqual({ ok: false, code: "camera_permission_denied" });
    expect(controller.active).toBe(false);
  });

  it("falls back safely when getUserMedia does not exist", async () => {
    const controller = new CameraController({ mediaDevices: null });
    const result = await controller.start();
    expect(result).toEqual({ ok: false, code: "camera_unavailable" });
  });

  it("stops every track on close", async () => {
    const { stream, tracks } = fakeStream();
    const { devices } = fakeDevices(stream);
    const controller = new CameraController({ mediaDevices: devices });
    await controller.start();
    controller.stop();
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(controller.active).toBe(false);
  });

  it("is safe to stop twice", async () => {
    const { stream, tracks } = fakeStream();
    const { devices } = fakeDevices(stream);
    const controller = new CameraController({ mediaDevices: devices });
    await controller.start();
    controller.stop();
    controller.stop();
    expect(tracks[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("releases the previous stream before starting another", async () => {
    const first = fakeStream();
    const second = fakeStream();
    let call = 0;
    const devices = {
      getUserMedia: vi.fn(async (_constraints: MediaStreamConstraints) => (call++ === 0 ? first.stream : second.stream)),
    };
    const controller = new CameraController({ mediaDevices: devices });
    await controller.start();
    await controller.start();
    expect(first.tracks[0]!.stop).toHaveBeenCalled();
  });

  it("switches between rear and front cameras", async () => {
    const { stream } = fakeStream();
    const { getUserMedia, devices } = fakeDevices(stream);
    const controller = new CameraController({ mediaDevices: devices });
    await controller.start();
    await controller.switchCamera();
    expect(controller.facing).toBe("user");
    const constraints = getUserMedia.mock.calls[1]![0] as MediaStreamConstraints;
    expect((constraints.video as MediaTrackConstraints).facingMode).toEqual({ ideal: "user" });
  });

  it("never uploads anything just by previewing", async () => {
    const { stream } = fakeStream();
    const { devices } = fakeDevices(stream);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new CameraController({ mediaDevices: devices });
    await controller.start();
    controller.stop();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("hasMultipleCameras", () => {
  it("is false when the device cannot be enumerated", async () => {
    await expect(hasMultipleCameras(null)).resolves.toBe(false);
  });

  it("is false with a single camera", async () => {
    const devices = {
      getUserMedia: vi.fn(),
      enumerateDevices: async () => [{ kind: "videoinput" }, { kind: "audioinput" }],
    };
    await expect(hasMultipleCameras(devices)).resolves.toBe(false);
  });

  it("is true with two cameras", async () => {
    const devices = {
      getUserMedia: vi.fn(),
      enumerateDevices: async () => [{ kind: "videoinput" }, { kind: "videoinput" }],
    };
    await expect(hasMultipleCameras(devices)).resolves.toBe(true);
  });
});
