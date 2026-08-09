/**
 * Phase 6V — performance-oriented pipeline regressions.
 *
 * These tests protect the behaviour that makes the SpacePlanner fast without
 * making it looser: one vision pass per photograph, deterministic merging in
 * code, a confidence gate on the second look, and caches that never invent or
 * retain a failure.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  mergeAcrossPhotos,
  REFINE_BELOW_CONFIDENCE,
  type DetectedItemPayload,
} from "@/routes/api/vision-detect";
import {
  clearPreparedCache,
  preparedCacheKey,
  preparedCacheSize,
} from "@/lib/spaceplanner/photo/image-optimise";
import {
  clearDetectionCache,
  readSpaceCache,
  spaceCacheKey,
  writeSpaceCache,
} from "@/lib/vision/detection-cache";
import {
  EMPTY_TIMINGS,
  budgetReport,
  mergeTimings,
} from "@/lib/spaceplanner/photo/timings";

function item(patch: Partial<DetectedItemPayload> & { id: string }): DetectedItemPayload {
  return {
    label: "Large blue wheeled case",
    category: "leisure",
    quantity: 1,
    widthCm: 50,
    depthCm: 30,
    heightCm: 70,
    volumeM3: 0.105,
    weight: "medium",
    fragile: false,
    stackable: true,
    confidence: 0.9,
    evidence: "visible in the foreground",
    photoIds: ["photo-1"],
    countBasis: "counted directly",
    occluded: false,
    components: [],
    sourceDetectionId: patch.id,
    mountingType: "floor",
    ...patch,
  } as DetectedItemPayload;
}

describe("Phase 6V — deterministic cross-photograph merge", () => {
  it("merges the same object seen in two photographs instead of doubling it", () => {
    const merged = mergeAcrossPhotos([
      [item({ id: "A", photoIds: ["photo-1"] })],
      [item({ id: "B", photoIds: ["photo-2"], confidence: 0.95 })],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(1);
    expect(merged[0]?.photoIds.sort()).toEqual(["photo-1", "photo-2"]);
    // The better-evidenced sighting wins the confidence.
    expect(merged[0]?.confidence).toBe(0.95);
  });

  it("keeps genuinely different objects apart", () => {
    const merged = mergeAcrossPhotos([
      [item({ id: "A", label: "Black backpack", category: "leisure" })],
      [item({ id: "B", label: "Cardboard box", category: "boxes" })],
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps same-name objects of very different size apart", () => {
    const merged = mergeAcrossPhotos([
      [item({ id: "A", widthCm: 30, depthCm: 20, heightCm: 40 })],
      [item({ id: "B", widthCm: 90, depthCm: 60, heightCm: 120 })],
    ]);
    expect(merged).toHaveLength(2);
  });

  it("never adds an object that was not detected", () => {
    expect(mergeAcrossPhotos([[], []])).toHaveLength(0);
  });

  it("is deterministic — same input, same output", () => {
    const groups = [
      [item({ id: "A" }), item({ id: "B", label: "Black backpack" })],
      [item({ id: "C", photoIds: ["photo-2"] })],
    ];
    const first = mergeAcrossPhotos(groups.map((group) => group.map((entry) => ({ ...entry }))));
    const second = mergeAcrossPhotos(groups.map((group) => group.map((entry) => ({ ...entry }))));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("gives every merged object a unique id", () => {
    const merged = mergeAcrossPhotos([
      [item({ id: "ITEM-001", label: "Black backpack" })],
      [item({ id: "ITEM-001", label: "Cardboard box", category: "boxes" })],
    ]);
    expect(new Set(merged.map((entry) => entry.id)).size).toBe(merged.length);
  });
});

describe("Phase 6V — confidence gating", () => {
  it("only re-examines objects the first pass could not identify", () => {
    const objects = [item({ id: "A", confidence: 0.92 }), item({ id: "B", confidence: 0.41 })];
    const uncertain = objects.filter((entry) => entry.confidence < REFINE_BELOW_CONFIDENCE);
    expect(uncertain.map((entry) => entry.id)).toEqual(["B"]);
  });

  it("treats 0.6 as confident enough to leave alone", () => {
    expect(0.6 < REFINE_BELOW_CONFIDENCE).toBe(false);
  });
});

describe("Phase 6V — prepare once, reuse everywhere", () => {
  beforeEach(() => {
    clearPreparedCache();
    clearDetectionCache();
  });

  it("keys prepared photos by url and target size", () => {
    expect(preparedCacheKey("blob:a", 1280)).toBe(preparedCacheKey("blob:a", 1280));
    expect(preparedCacheKey("blob:a", 1280)).not.toBe(preparedCacheKey("blob:a", 640));
    expect(preparedCacheKey("blob:a", 1280)).not.toBe(preparedCacheKey("blob:b", 1280));
  });

  it("starts empty and clears cleanly", () => {
    expect(preparedCacheSize()).toBe(0);
  });
});

describe("Phase 6V — room model reuse", () => {
  beforeEach(() => clearDetectionCache());

  const input = {
    photos: [{ id: "photo-1", sizeBytes: 100, rotation: 0 }],
    selections: [],
    mode: "whole",
    spaceType: "garage",
  };

  it("re-uses an unchanged room analysis", () => {
    const key = spaceCacheKey(input);
    writeSpaceCache(key, { usableAreaM2: 12 });
    expect(readSpaceCache<{ usableAreaM2: number }>(key)?.usableAreaM2).toBe(12);
  });

  it("invalidates when the photograph changes", () => {
    writeSpaceCache(spaceCacheKey(input), { usableAreaM2: 12 });
    const changed = spaceCacheKey({
      ...input,
      photos: [{ id: "photo-1", sizeBytes: 200, rotation: 0 }],
    });
    expect(readSpaceCache(changed)).toBeNull();
  });

  it("invalidates when the declared space type changes", () => {
    writeSpaceCache(spaceCacheKey(input), { usableAreaM2: 12 });
    expect(readSpaceCache(spaceCacheKey({ ...input, spaceType: "loft" }))).toBeNull();
  });
});

describe("Phase 6V — timing breakdown", () => {
  it("reports unmeasured stages as unknown, never as fast", () => {
    const report = budgetReport(EMPTY_TIMINGS);
    expect(report.belongings.state).toBe("unknown");
    expect(report.allWithinBudget).toBe(false);
    expect(report.bottleneck).toBeNull();
  });

  it("carries the new per-stage fields through a merge", () => {
    const timings = mergeTimings(EMPTY_TIMINGS, {
      photoPrepMs: 210,
      detectionMs: 1800,
      mergeMs: 2,
      refineMs: 0,
      scanCalls: 3,
      refineCalls: 0,
      inventoryReadyMs: 2400,
    });
    expect(timings.photoPrepMs).toBe(210);
    expect(timings.mergeMs).toBe(2);
    expect(timings.scanCalls).toBe(3);
    expect(budgetReport(timings).belongings.state).toBe("within");
  });

  it("names the slowest measured stage as the bottleneck", () => {
    const timings = mergeTimings(EMPTY_TIMINGS, {
      photoPrepMs: 200,
      detectionMs: 4200,
      refineMs: 900,
    });
    expect(budgetReport(timings).bottleneck).toBe("detection");
  });

  it("fails the belongings budget honestly when the scan runs long", () => {
    const timings = mergeTimings(EMPTY_TIMINGS, { inventoryReadyMs: 7200 });
    const report = budgetReport(timings);
    expect(report.belongings.state).toBe("over");
    expect(report.belongings.overBy).toBe(2200);
    expect(report.allWithinBudget).toBe(false);
  });
});
