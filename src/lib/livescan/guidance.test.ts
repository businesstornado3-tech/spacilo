/**
 * Live guidance and capture readiness.
 *
 * Guidance is deterministic and derived only from local signals. The host path
 * must never express a measurement — it only says whether the frame is worth
 * sending to the existing server analysis.
 */
import { describe, expect, it } from "vitest";

import {
  HOST_RESHOOT_TIPS,
  hostGuidance,
  hostPossibleObstructions,
  objectCoverage,
  renterGuidance,
} from "@/lib/livescan/guidance";
import type { FrameQuality, StableDetection } from "@/lib/livescan/types";

const good: FrameQuality = { brightness: 0.5, sharpness: 0.7, motion: 0.05 };
const dark: FrameQuality = { brightness: 0.02, sharpness: 0.7, motion: 0.05 };
const blown: FrameQuality = { brightness: 0.99, sharpness: 0.7, motion: 0.05 };
const blurry: FrameQuality = { brightness: 0.5, sharpness: 0.02, motion: 0.05 };
const moving: FrameQuality = { brightness: 0.5, sharpness: 0.7, motion: 0.9 };

function detection(rawClass: string, confirmed = true, size = 10): StableDetection {
  return {
    id: `${rawClass}-${size}`,
    rawClass,
    label: rawClass,
    category: "other",
    catalogueKey: null,
    score: 0.9,
    bbox: [0, 0, size, size],
    frames: 5,
    firstSeenAt: 0,
    lastSeenAt: 500,
    confirmed,
  };
}

describe("renter guidance", () => {
  it("asks for more light in the dark", () => {
    const guidance = renterGuidance([], dark);
    expect(guidance.readiness).toBe("not_ready");
    expect(guidance.message).toMatch(/light/i);
  });

  it("asks the user to slow down when moving", () => {
    expect(renterGuidance([], moving).message).toMatch(/slowly/i);
  });

  it("asks the user to hold still when blurry", () => {
    expect(renterGuidance([], blurry).message).toMatch(/blurry/i);
  });

  it("asks the user to point at their belongings when nothing is found", () => {
    const guidance = renterGuidance([], good);
    expect(guidance.readiness).toBe("improving");
    expect(guidance.message).toMatch(/point at/i);
  });

  it("waits for a confirmed detection before declaring readiness", () => {
    expect(renterGuidance([detection("bicycle", false)], good).readiness).toBe("improving");
  });

  it("is ready once something is confirmed on a good frame", () => {
    const guidance = renterGuidance([detection("bicycle")], good);
    expect(guidance.readiness).toBe("ready");
    expect(guidance.message).toMatch(/ready to capture/i);
  });

  it("always exposes textual checks, not just colour", () => {
    const guidance = renterGuidance([detection("bicycle")], good);
    expect(guidance.checks).toHaveLength(3);
    expect(guidance.checks.every((check) => typeof check.label === "string")).toBe(true);
  });

  it("marks the light check as failed in the dark", () => {
    const guidance = renterGuidance([], dark);
    expect(guidance.checks.find((check) => check.label === "Enough light")?.met).toBe(false);
  });

  it("is deterministic", () => {
    expect(renterGuidance([detection("bicycle")], good)).toEqual(
      renterGuidance([detection("bicycle")], good),
    );
  });

  it("never promises accuracy", () => {
    const guidance = renterGuidance([detection("bicycle")], good);
    expect(guidance.message).not.toMatch(/guarantee|exact|100%|precise/i);
  });
});

describe("host guidance", () => {
  const clear = { quality: good, detections: [], objectCoverage: 0 };

  it("blocks capture in poor light", () => {
    expect(hostGuidance({ ...clear, quality: dark }).readiness).toBe("not_ready");
  });

  it("warns about glare", () => {
    expect(hostGuidance({ ...clear, quality: blown }).message).toMatch(/bright/i);
  });

  it("warns about movement", () => {
    expect(hostGuidance({ ...clear, quality: moving }).message).toMatch(/slowly/i);
  });

  it("warns about blur", () => {
    expect(hostGuidance({ ...clear, quality: blurry }).message).toMatch(/still|blurry/i);
  });

  it("asks for more floor when the frame is crowded", () => {
    const guidance = hostGuidance({ ...clear, objectCoverage: 0.8 });
    expect(guidance.readiness).toBe("improving");
    expect(guidance.message).toMatch(/floor/i);
  });

  it("is ready on a clear, well-lit, steady frame", () => {
    expect(hostGuidance(clear).readiness).toBe("ready");
  });

  it("never states a measurement live", () => {
    for (const quality of [good, dark, blown, blurry, moving]) {
      const guidance = hostGuidance({ ...clear, quality });
      const text = `${guidance.message} ${guidance.checks.map((c) => c.label).join(" ")}`;
      expect(text).not.toMatch(/\d+(\.\d+)?\s*(m|metre|metres|m²|m³|cm|ft)\b/i);
    }
  });

  it("never claims the space is measured, verified or guaranteed", () => {
    const text = `${hostGuidance(clear).message} ${HOST_RESHOOT_TIPS.join(" ")}`;
    expect(text).not.toMatch(/measured|verified|guaranteed|100%/i);
  });

  it("offers deterministic re-shoot tips", () => {
    expect(HOST_RESHOOT_TIPS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("host scene signals", () => {
  it("names likely permanent obstructions", () => {
    expect(hostPossibleObstructions([detection("refrigerator"), detection("couch")])).toEqual(
      expect.arrayContaining(["Large appliance", "Furniture"]),
    );
  });

  it("ignores unconfirmed detections", () => {
    expect(hostPossibleObstructions([detection("refrigerator", false)])).toEqual([]);
  });

  it("de-duplicates obstruction labels", () => {
    expect(hostPossibleObstructions([detection("couch", true, 10), detection("bed", true, 20)])).toEqual(
      ["Furniture"],
    );
  });

  it("computes coverage as a 0–1 share of the frame", () => {
    expect(objectCoverage([detection("couch", true, 100)], 200, 200)).toBeCloseTo(0.25);
  });

  it("clamps coverage at 1", () => {
    expect(objectCoverage([detection("couch", true, 500)], 100, 100)).toBe(1);
  });

  it("is 0 for an empty frame", () => {
    expect(objectCoverage([], 100, 100)).toBe(0);
    expect(objectCoverage([detection("couch")], 0, 0)).toBe(0);
  });
});
