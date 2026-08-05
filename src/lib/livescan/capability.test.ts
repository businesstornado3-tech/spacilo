/**
 * Live Scan capability detection.
 *
 * Camera, live vision and metric measurement are three separate capabilities.
 * The most important assertion here is the last one: a plain RGB camera never
 * reports metric measurement, so no metre figure can ever be fabricated live.
 */
import { describe, expect, it } from "vitest";

import { detectLiveScanCapability } from "@/lib/livescan/capability";

const capable = {
  mediaDevices: { getUserMedia: () => undefined },
  isSecureContext: true,
  hasAcceleratedGraphics: true,
  hasWebAssembly: true,
};

describe("detectLiveScanCapability", () => {
  it("reports a fully capable device", () => {
    const capability = detectLiveScanCapability(capable);
    expect(capability.camera).toBe(true);
    expect(capability.liveVision).toBe(true);
    expect(capability.reason).toBe("ok");
  });

  it("refuses the camera outside a secure context", () => {
    const capability = detectLiveScanCapability({ ...capable, isSecureContext: false });
    expect(capability.camera).toBe(false);
    expect(capability.liveVision).toBe(false);
    expect(capability.reason).toBe("insecure_context");
  });

  it("refuses the camera when getUserMedia is missing", () => {
    const capability = detectLiveScanCapability({ ...capable, mediaDevices: {} });
    expect(capability.camera).toBe(false);
    expect(capability.reason).toBe("no_camera_api");
  });

  it("keeps the camera but drops live vision without a model runtime", () => {
    const capability = detectLiveScanCapability({
      ...capable,
      hasAcceleratedGraphics: false,
      hasWebAssembly: false,
    });
    expect(capability.camera).toBe(true);
    expect(capability.liveVision).toBe(false);
    expect(capability.reason).toBe("no_model_runtime");
  });

  it("drops live vision on very low-memory devices", () => {
    const capability = detectLiveScanCapability({ ...capable, deviceMemoryGb: 1 });
    expect(capability.camera).toBe(true);
    expect(capability.liveVision).toBe(false);
    expect(capability.reason).toBe("low_memory");
  });

  it("never reports metric measurement without a declared scale source", () => {
    const capability = detectLiveScanCapability(capable);
    expect(capability.metricMeasurement).toBe(false);
    expect(capability.metricScaleSource).toBeNull();
  });

  it("reports metric measurement only when a scale source identifies itself", () => {
    const capability = detectLiveScanCapability({ ...capable, metricScaleSource: "webxr-depth" });
    expect(capability.metricMeasurement).toBe(true);
    expect(capability.metricScaleSource).toBe("webxr-depth");
  });

  it("ignores a scale source on a device that cannot run live vision", () => {
    const capability = detectLiveScanCapability({
      ...capable,
      hasAcceleratedGraphics: false,
      hasWebAssembly: false,
      metricScaleSource: "webxr-depth",
    });
    expect(capability.metricMeasurement).toBe(false);
  });
});
