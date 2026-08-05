/**
 * Adaptive performance modes and the camera-first performance contract.
 *
 * The camera preview outranks every AI effect: a device that can open a camera
 * must never be trapped in a laggy Live Scan.
 */
import { describe, expect, it } from "vitest";

import { cameraConstraints, DEFAULT_PREVIEW_PROFILE } from "@/lib/livescan/camera";
import {
  PERFORMANCE_PROFILES,
  PerformanceGovernor,
  inferenceSize,
} from "@/lib/livescan/performance";
import { InferenceScheduler } from "@/lib/livescan/scheduler";

describe("performance profiles", () => {
  it("requests a modest preview rather than 1080p", () => {
    const video = cameraConstraints("environment") as { video: MediaTrackConstraints };
    expect((video.video.width as { max: number }).max).toBeLessThanOrEqual(1280);
    expect((video.video.height as { max: number }).max).toBeLessThanOrEqual(720);
    expect((video.video.frameRate as { max: number }).max).toBeLessThanOrEqual(30);
    expect(DEFAULT_PREVIEW_PROFILE.width).toBeLessThanOrEqual(960);
  });

  it("prefers the rear camera on mobile", () => {
    const constraints = cameraConstraints("environment") as { video: MediaTrackConstraints };
    expect(constraints.video.facingMode).toEqual({ ideal: "environment" });
  });

  it("drops preview resolution and inference cost in reduced mode", () => {
    expect(PERFORMANCE_PROFILES.reduced.preview.width).toBeLessThan(
      PERFORMANCE_PROFILES.full.preview.width,
    );
    expect(PERFORMANCE_PROFILES.reduced.inferenceEdge).toBeLessThan(
      PERFORMANCE_PROFILES.full.inferenceEdge,
    );
    expect(PERFORMANCE_PROFILES.reduced.intervalMs).toBeGreaterThan(
      PERFORMANCE_PROFILES.full.intervalMs,
    );
  });

  it("runs no inference at all in photo mode", () => {
    expect(PERFORMANCE_PROFILES.photo.inferenceEdge).toBe(0);
  });

  it("never feeds the detector a full-resolution frame", () => {
    const size = inferenceSize(1280, 720, PERFORMANCE_PROFILES.full.inferenceEdge);
    expect(size.width).toBe(256);
    expect(size.height).toBe(144);
  });

  it("never upscales a small frame", () => {
    expect(inferenceSize(160, 90, 256)).toEqual({ width: 160, height: 90 });
  });
});

describe("performance governor", () => {
  it("stays in full mode while passes are fast", () => {
    const governor = new PerformanceGovernor();
    for (let index = 0; index < 20; index += 1) expect(governor.record(120)).toBe(false);
    expect(governor.mode).toBe("full");
  });

  it("steps down after repeated slow passes", () => {
    const governor = new PerformanceGovernor();
    // Two slow passes are now enough: the preview must not wait longer.
    expect(governor.record(300)).toBe(false);
    expect(governor.record(300)).toBe(true);
    expect(governor.mode).toBe("reduced");
  });

  it("steps down immediately on a critically slow pass", () => {
    const governor = new PerformanceGovernor();
    expect(governor.record(1500)).toBe(true);
    expect(governor.mode).toBe("reduced");
  });

  it("falls all the way back to photo mode and stops there", () => {
    const governor = new PerformanceGovernor();
    governor.record(2000);
    governor.record(2000);
    expect(governor.mode).toBe("photo");
    expect(governor.record(2000)).toBe(false);
    expect(governor.mode).toBe("photo");
  });

  it("does not oscillate back up mid-scan", () => {
    const governor = new PerformanceGovernor();
    governor.record(1500);
    governor.record(50);
    governor.record(50);
    expect(governor.mode).toBe("reduced");
  });

  it("forces reduced mode when the device can't run a model", () => {
    const governor = new PerformanceGovernor();
    expect(governor.forceMode("reduced")).toBe(true);
    expect(governor.profile.inferenceEdge).toBe(PERFORMANCE_PROFILES.reduced.inferenceEdge);
  });

  it("resets to full for the next scan", () => {
    const governor = new PerformanceGovernor();
    governor.record(2000);
    governor.reset();
    expect(governor.mode).toBe("full");
  });
});

describe("inference throttling", () => {
  it("never allows two passes at once", () => {
    const scheduler = new InferenceScheduler();
    expect(scheduler.shouldRun(1000)).toBe(true);
    scheduler.begin(1000);
    expect(scheduler.shouldRun(1000)).toBe(false);
    expect(scheduler.shouldRun(99_000)).toBe(false);
    scheduler.end(100);
    expect(scheduler.shouldRun(99_000)).toBe(true);
  });

  it("throttles between passes", () => {
    const scheduler = new InferenceScheduler();
    scheduler.begin(1000);
    scheduler.end(50);
    expect(scheduler.shouldRun(1100)).toBe(false);
    expect(scheduler.shouldRun(1700)).toBe(true);
  });

  it("backs off when the device is slow", () => {
    const scheduler = new InferenceScheduler();
    scheduler.begin(0);
    scheduler.end(900);
    expect(scheduler.intervalMs).toBeGreaterThanOrEqual(900);
  });

  it("pauses entirely while the page is hidden", () => {
    const scheduler = new InferenceScheduler();
    scheduler.setHidden(true);
    expect(scheduler.shouldRun(999_999)).toBe(false);
    scheduler.setHidden(false);
    expect(scheduler.shouldRun(999_999)).toBe(true);
  });
});
