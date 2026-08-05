/**
 * Live guidance and capture readiness.
 *
 * Guidance is deterministic and derived only from local signals. The host path
 * must never express a measurement — it only says whether the frame is worth
 * sending to the existing server analysis.
 */
import { describe, expect, it } from "vitest";

import { captureReadiness, guidanceFor } from "@/lib/livescan/guidance";
import type { FrameQuality, StableDetection } from "@/lib/livescan/types";

const good: FrameQuality = { brightness: 0.5, sharpness: 0.7, motion: 0.05 };
const dark: FrameQuality = { brightness: 0.05, sharpness: 0.7, motion: 0.05 };
const blurry: FrameQuality = { brightness: 0.5, sharpness: 0.1, motion: 0.05 };
const moving: FrameQuality = { brightness: 0.5, sharpness: 0.7, motion: 0.6 };

const detection = (label: string): StableDetection => ({
  id: label,
  label,
  category: "other",
  catalogueKey: null,
  score: 0.9,
  bbox: [0, 0, 10, 10],
  confirmed: true,
});

describe("captureReadiness", () => {
  it("is ready on a good frame", () => {
    expect(captureReadiness(good).state).toBe("ready");
  });

  it("is not ready in the dark", () => {
    const readiness = captureReadiness(dark);
    expect(readiness.state).toBe("improving");
    expect(readiness.issues).toContain("too_dark");
  });

  it("is not ready when blurry", () => {
    expect(captureReadiness(blurry).issues).toContain("blurry");
  });

  it("is not ready while the phone is moving", () => {
    expect(captureReadiness(moving).issues).toContain("moving");
  });

  it("reports a glare-bright frame", () => {
    expect(captureReadiness({ ...good, brightness: 0.99 }).issues).toContain("too_bright");
  });

  it("collects several issues at once", () => {
    const readiness = captureReadiness({ brightness: 0.03, sharpness: 0.05, motion: 0.8 });
    expect(readiness.issues.length).toBeGreaterThanOrEqual(3);
    expect(readiness.state).toBe("improving");
  });
});

describe("renter guidance", () => {
  it("asks the user to pan when nothing is found", () => {
    const guidance = guidanceFor("renter", { quality: good, detections: [] });
    expect(guidance.headline).toMatch(/slowly/i);
    expect(guidance.tone).toBe("neutral");
  });

  it("acknowledges found items", () => {
    const guidance = guidanceFor("renter", {
      quality: good,
      detections: [detection("Bicycle"), detection("Suitcase")],
    });
    expect(guidance.headline).toMatch(/2 items/);
    expect(guidance.tone).toBe("positive");
  });

  it("uses the singular for one item", () => {
    const guidance = guidanceFor("renter", { quality: good, detections: [detection("Bicycle")] });
    expect(guidance.headline).toMatch(/1 item/);
  });

  it("prioritises a quality problem over detections", () => {
    const guidance = guidanceFor("renter", { quality: dark, detections: [detection("Bicycle")] });
    expect(guidance.headline).toMatch(/light/i);
    expect(guidance.tone).toBe("warning");
  });

  it("never promises accuracy", () => {
    const guidance = guidanceFor("renter", { quality: good, detections: [detection("Bicycle")] });
    expect(`${guidance.headline} ${guidance.detail}`).not.toMatch(
      /guarantee|exact|100%|accurate|precise/i,
    );
  });
});

describe("host guidance", () => {
  it("asks for a doorway framing", () => {
    const guidance = guidanceFor("host", { quality: good, detections: [] });
    expect(guidance.detail).toMatch(/doorway|corner|floor/i);
  });

  it("flags a dark space", () => {
    expect(guidanceFor("host", { quality: dark, detections: [] }).headline).toMatch(/light/i);
  });

  it("flags camera movement", () => {
    expect(guidanceFor("host", { quality: moving, detections: [] }).headline).toMatch(/still/i);
  });

  it("confirms when the frame is worth capturing", () => {
    const guidance = guidanceFor("host", { quality: good, detections: [] });
    expect(guidance.tone).toBe("positive");
  });

  it("never states a measurement live", () => {
    for (const quality of [good, dark, blurry, moving]) {
      const guidance = guidanceFor("host", { quality, detections: [] });
      const text = `${guidance.headline} ${guidance.detail}`;
      expect(text).not.toMatch(/\d+(\.\d+)?\s*(m|metre|metres|m²|m³|cm|ft)\b/i);
    }
  });

  it("never claims the space is measured or verified", () => {
    const guidance = guidanceFor("host", { quality: good, detections: [] });
    expect(`${guidance.headline} ${guidance.detail}`).not.toMatch(/measured|verified|guaranteed/i);
  });
});
