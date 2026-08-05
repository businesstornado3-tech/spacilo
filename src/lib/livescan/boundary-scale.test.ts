import { describe, expect, it } from "vitest";

import { defaultBoundary, type PolygonBoundary } from "@/lib/livescan/boundary";
import {
  deriveScale,
  measureBoundary,
  perspectiveSafe,
  type ReferenceEdge,
} from "@/lib/livescan/boundary-scale";

const frame = { width: 1000, height: 1000 };

const straightOn: PolygonBoundary = {
  shape: "rectangle",
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.6 },
    { x: 0.2, y: 0.6 },
  ],
};

const skewed: PolygonBoundary = {
  shape: "rectangle",
  points: [
    { x: 0.3, y: 0.25 },
    { x: 0.75, y: 0.35 },
    { x: 0.95, y: 0.9 },
    { x: 0.05, y: 0.75 },
  ],
};

const reference: ReferenceEdge = { edgeIndex: 0, metres: 3, label: "Doorway wall" };

describe("boundary scale safety", () => {
  it("refuses metres without a host reference", () => {
    const result = deriveScale(straightOn, frame, null);
    expect(result).toEqual({ ok: false, reason: "no_reference" });
  });

  it("refuses implausible reference lengths", () => {
    expect(deriveScale(straightOn, frame, { ...reference, metres: 0 }).ok).toBe(false);
    expect(deriveScale(straightOn, frame, { ...reference, metres: 500 })).toEqual({
      ok: false,
      reason: "reference_out_of_range",
    });
  });

  it("refuses metres when the shot is too angled", () => {
    expect(perspectiveSafe(skewed, frame)).toBe(false);
    expect(deriveScale(skewed, frame, reference)).toEqual({
      ok: false,
      reason: "perspective_unsafe",
    });
  });

  it("never scales circles or irregular polygons", () => {
    expect(perspectiveSafe(defaultBoundary("circle"), frame)).toBe(false);
    const polygon: PolygonBoundary = {
      shape: "polygon",
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.6 },
        { x: 0.5, y: 0.7 },
        { x: 0.2, y: 0.6 },
      ],
    };
    expect(deriveScale(polygon, frame, reference).ok).toBe(false);
  });

  it("derives a scale from a straight-on reference edge", () => {
    const result = deriveScale(straightOn, frame, reference);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 0.6 of a 1000px frame = 600px represents 3 m.
    expect(result.metresPerPixel).toBeCloseTo(3 / 600, 6);
    expect(result.provenance).toBe("host_reference_edge");
  });

  it("measures area, exclusions and volume as estimates", () => {
    const scale = deriveScale(straightOn, frame, reference);
    expect(scale.ok).toBe(true);
    if (!scale.ok) return;

    const exclusion: PolygonBoundary = {
      shape: "rectangle",
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.2 },
        { x: 0.4, y: 0.4 },
        { x: 0.2, y: 0.4 },
      ],
    };

    const measurement = measureBoundary({
      boundary: straightOn,
      frame,
      scale,
      target: "floor",
      exclusions: [exclusion],
      heightM: 2,
    });

    expect(measurement.widthM).toBeCloseTo(3, 2);
    expect(measurement.depthM).toBeCloseTo(2, 2);
    expect(measurement.areaM2).toBeCloseTo(6, 2);
    expect(measurement.excludedM2).toBeCloseTo(1, 2);
    expect(measurement.usableM2).toBeCloseTo(5, 2);
    expect(measurement.volumeM3).toBeCloseTo(10, 2);
    expect(measurement.estimated).toBe(true);
    expect(measurement.provenance).toBe("host_reference_edge");
  });

  it("omits volume when no height is supplied", () => {
    const scale = deriveScale(straightOn, frame, reference);
    if (!scale.ok) throw new Error("expected scale");
    const measurement = measureBoundary({ boundary: straightOn, frame, scale, target: "floor" });
    expect(measurement.volumeM3).toBeNull();
  });
});
