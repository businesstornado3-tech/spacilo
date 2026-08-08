/**
 * Phase 6D regressions.
 *
 * These lock in the rules that stop the failures we actually saw: inventory
 * the user never asked for, components counted as separate items, repeated
 * analysis of unchanged photos, and earnings quoted from raw room volume.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  boundingBox,
  describeSelection,
  ellipseSelection,
  fullSelection,
  isFullPhoto,
  isUsableSelection,
  lassoSelection,
  pointInSelection,
  rectSelection,
  selectionCoverage,
  selectionsSignature,
} from "@/lib/vision/selection";
import {
  clearDetectionCache,
  clearTimings,
  detectionCacheKey,
  percentile,
  readDetectionCache,
  recordTiming,
  writeDetectionCache,
} from "@/lib/vision/detection-cache";
import { assessPhotoQuality } from "@/lib/vision/photo-quality";
import { earningsFromPlan, RENTABLE_SHARE } from "@/lib/spaceplanner/photo/earnings";
import { normaliseItems } from "@/routes/api/vision-detect";
import type { DetectedObject } from "@/lib/vision/types";

const photo = "photo-1";

describe("user-controlled selection", () => {
  it("keeps a rectangle inside the photo whichever way it was dragged", () => {
    const selection = rectSelection(photo, { x: 0.8, y: 0.9 }, { x: -0.4, y: 0.2 });
    const box = boundingBox(selection);
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo(0.2, 5);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
  });

  it("treats a whole-photo selection as unconstrained", () => {
    expect(isFullPhoto(fullSelection(photo))).toBe(true);
    expect(describeSelection(fullSelection(photo))).toContain("whole photograph");
  });

  it("rejects an accidental tap-sized outline but keeps a real one", () => {
    const tiny = rectSelection(photo, { x: 0.5, y: 0.5 }, { x: 0.502, y: 0.502 });
    const real = rectSelection(photo, { x: 0.2, y: 0.2 }, { x: 0.7, y: 0.8 });
    expect(isUsableSelection(tiny)).toBe(false);
    expect(isUsableSelection(real)).toBe(true);
    expect(selectionCoverage(real)).toBeCloseTo(0.3, 5);
  });

  it("hit-tests points against a freehand outline", () => {
    const lasso = lassoSelection(photo, [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.1 },
      { x: 0.6, y: 0.6 },
      { x: 0.1, y: 0.6 },
    ]);
    expect(pointInSelection(lasso, { x: 0.3, y: 0.3 })).toBe(true);
    expect(pointInSelection(lasso, { x: 0.9, y: 0.9 })).toBe(false);
  });

  it("approximates an ellipse as a closed polygon", () => {
    const ellipse = ellipseSelection(photo, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.6 });
    expect(ellipse.points.length).toBeGreaterThan(8);
    expect(pointInSelection(ellipse, { x: 0.5, y: 0.4 })).toBe(true);
    expect(pointInSelection(ellipse, { x: 0.21, y: 0.21 })).toBe(false);
  });

  it("signs the same selections identically regardless of order", () => {
    const a = rectSelection("p1", { x: 0, y: 0 }, { x: 0.5, y: 0.5 });
    const b = rectSelection("p2", { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.6 });
    expect(selectionsSignature([a, b])).toBe(selectionsSignature([b, a]));
  });
});

describe("composite objects", () => {
  it("keeps a cot as one item with its parts as components", () => {
    const items = normaliseItems(
      [
        {
          label: "Cot",
          category: "furniture",
          quantity: 1,
          widthCm: 120,
          depthCm: 65,
          heightCm: 95,
          weight: "medium",
          components: ["side rails", "mattress", "base panel"],
          photoIds: [photo],
        },
      ],
      [photo],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Cot");
    expect(items[0]!.components).toEqual(["side rails", "mattress", "base panel"]);
  });

  it("never fabricates an item from an empty reply", () => {
    expect(normaliseItems(undefined, [photo])).toEqual([]);
    expect(normaliseItems([{ label: "  " }], [photo])).toEqual([]);
  });
});

describe("detection cache", () => {
  const photos = [{ id: photo, sizeBytes: 1000, rotation: 0 }];
  const object: DetectedObject = {
    id: "ITEM-001",
    label: "Cot",
    category: "furniture",
    confidence: 0.8,
    width: 120,
    depth: 65,
    height: 95,
    weight: "medium",
    quantity: 1,
    fragile: false,
    stackable: false,
    catalogueId: null,
    photoIds: [photo],
    source: "ai",
  };

  beforeEach(() => {
    clearDetectionCache();
    clearTimings();
  });

  it("reuses a result for identical photos and selection", () => {
    const selection = rectSelection(photo, { x: 0.1, y: 0.1 }, { x: 0.7, y: 0.7 });
    const key = detectionCacheKey({ photos, selections: [selection], mode: "selected" });
    writeDetectionCache(key, [object]);
    expect(readDetectionCache(key)?.[0]?.label).toBe("Cot");
  });

  it("misses when the user changes the selection", () => {
    const first = rectSelection(photo, { x: 0.1, y: 0.1 }, { x: 0.7, y: 0.7 });
    const second = rectSelection(photo, { x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 });
    const key = detectionCacheKey({ photos, selections: [first], mode: "selected" });
    writeDetectionCache(key, [object]);
    expect(
      readDetectionCache(detectionCacheKey({ photos, selections: [second], mode: "selected" })),
    ).toBeNull();
  });

  it("misses when the mode changes", () => {
    const key = detectionCacheKey({ photos, selections: [], mode: "whole" });
    writeDetectionCache(key, [object]);
    expect(
      readDetectionCache(detectionCacheKey({ photos, selections: [], mode: "selected" })),
    ).toBeNull();
  });

  it("records timings for the performance budget", () => {
    recordTiming("belongings", 8000);
    recordTiming("belongings", 12000);
    expect(percentile("belongings", 50)).toBeGreaterThan(0);
  });
});

describe("photo quality", () => {
  it("passes a good photo", () => {
    expect(
      assessPhotoQuality({ widthPx: 1600, heightPx: 1200, meanLuminance: 0.5, detail: 0.2 }).issues,
    ).toEqual([]);
  });

  it("flags a dark, small photo with advice", () => {
    const quality = assessPhotoQuality({
      widthPx: 320,
      heightPx: 240,
      meanLuminance: 0.05,
      detail: 0.2,
    });
    expect(quality.issues).toContain("too_dark");
    expect(quality.issues).toContain("too_small");
    expect(quality.advice.length).toBe(2);
    expect(quality.score).toBeLessThan(1);
  });
});

describe("earnings from usable capacity", () => {
  it("prices the rentable share, never the raw volume", () => {
    const earnings = earningsFromPlan({
      usableVolumeM3: 20,
      usableAreaM2: 10,
      spaceType: "garage",
    });
    expect(earnings.capacity.rentableVolumeM3).toBeCloseTo(20 * RENTABLE_SHARE, 1);
    expect(earnings.capacity.rentableAreaM2).toBeLessThan(10);
    expect(earnings.monthlyMax).toBeGreaterThanOrEqual(earnings.monthlyMin);
    expect(earnings.annualMin).toBe(earnings.monthlyMin * 12);
  });

  it("accounts for space already in use", () => {
    const empty = earningsFromPlan({ usableVolumeM3: 20, usableAreaM2: 10, spaceType: "garage" });
    const half = earningsFromPlan({
      usableVolumeM3: 20,
      usableAreaM2: 10,
      occupiedVolumeM3: 10,
      spaceType: "garage",
    });
    expect(empty.capacity.currentUtilisation).toBe(0);
    expect(half.capacity.currentUtilisation).toBe(50);
    expect(half.capacity.potentialUtilisation).toBeGreaterThan(50);
  });
});
