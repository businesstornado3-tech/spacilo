/**
 * Phase 6Y regression tests.
 *
 * Three promises are locked down here:
 *   1. A thin scan is DETECTED as thin, so the sweep actually fires.
 *   2. Nothing detected is ever silently dropped on the way to the manifest.
 *   3. The click → arrangement metric excludes time the user spent thinking,
 *      so the 5-second claim describes the product and not the person.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { assessCompleteness, MIN_OBJECTS_PER_PHOTO } from "@/lib/vision/completeness";
import { reconcileInventory } from "@/lib/spaceplanner/photo/reconcile";
import {
  arrangementMetrics,
  beginUserWait,
  endUserWait,
  markArrangement,
  resetArrangementRun,
  startArrangementRun,
} from "@/lib/spaceplanner/photo/arrangement-perf";
import type { DetectedObject } from "@/lib/vision/types";
import type { CanonicalInventory, PlacementManifest } from "@/lib/spaceplanner/photo/manifest";

const big = { widthCm: 120, depthCm: 60, heightCm: 80 };
const small = { widthCm: 30, depthCm: 20, heightCm: 25 };

function item(label: string, size: typeof big) {
  return { label, ...size };
}

describe("Phase 6Y — completeness assessment", () => {
  it("flags a photograph that returned only a couple of objects", () => {
    const verdict = assessCompleteness({
      items: [item("television", big), item("suitcase", big)],
      photoCount: 1,
      mode: "whole",
    });
    expect(verdict.incomplete).toBe(true);
    expect(verdict.reasons.length).toBeGreaterThan(0);
    expect(verdict.density).toBeLessThan(MIN_OBJECTS_PER_PHOTO);
  });

  it("flags large objects with no small objects at all", () => {
    const verdict = assessCompleteness({
      items: [
        item("wardrobe", big),
        item("sofa", big),
        item("television", big),
        item("bookcase", big),
        item("chest of drawers", big),
      ],
      photoCount: 1,
      mode: "whole",
    });
    expect(verdict.smallObjectCount).toBe(0);
    expect(verdict.incomplete).toBe(true);
  });

  it("accepts a dense scan containing both large and small objects", () => {
    const verdict = assessCompleteness({
      items: [
        item("television", big),
        item("television stand", big),
        item("suitcase", big),
        item("storage box", small),
        item("desk lamp", small),
        item("holdall", small),
      ],
      photoCount: 1,
      mode: "whole",
    });
    expect(verdict.incomplete).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it("never second-guesses a region the user marked themselves", () => {
    const verdict = assessCompleteness({
      items: [item("television", big)],
      photoCount: 1,
      mode: "selected",
    });
    expect(verdict.incomplete).toBe(false);
  });

  it("treats an empty scan as incomplete rather than as an empty room", () => {
    const verdict = assessCompleteness({ items: [], photoCount: 2, mode: "whole" });
    expect(verdict.incomplete).toBe(true);
  });
});

function detected(id: string, label: string, quantity: number): DetectedObject {
  return {
    id,
    label,
    category: "furniture",
    quantity,
    confidence: 0.9,
    dimensionsCm: { width: 100, depth: 50, height: 60 },
    volumeM3: 0.3,
    photoIds: ["p1"],
  } as DetectedObject;
}

function inventoryOf(objects: DetectedObject[]): CanonicalInventory {
  return {
    objects,
    itemCount: objects.reduce((sum, object) => sum + object.quantity, 0),
    distinctItems: objects.length,
    totalVolumeM3: objects.length * 0.3,
    lockedAt: 0,
    hash: "test",
  } as CanonicalInventory;
}

function manifestOf(ids: string[], placedUnits: number, expectedUnits: number): PlacementManifest {
  return {
    entries: ids.map((id) => ({ id })),
    placedUnits,
    expectedUnits,
  } as unknown as PlacementManifest;
}

describe("Phase 6Y — inventory reconciliation", () => {
  it("balances when every detected unit is placed", () => {
    const objects = [detected("a", "television", 1), detected("b", "suitcase", 2)];
    const report = reconcileInventory({
      detected: objects,
      inventory: inventoryOf(objects),
      manifest: manifestOf(["a", "b"], 3, 3),
    });
    expect(report.detectedCount).toBe(3);
    expect(report.classifiedCount).toBe(3);
    expect(report.droppedCount).toBe(0);
    expect(report.balanced).toBe(true);
  });

  it("counts an explicitly unplaced item as accounted for, not dropped", () => {
    const objects = [detected("a", "television", 1), detected("b", "suitcase", 1)];
    const report = reconcileInventory({
      detected: objects,
      inventory: inventoryOf(objects),
      manifest: manifestOf(["a", "b"], 1, 2),
    });
    expect(report.manifestUnplacedCount).toBe(1);
    expect(report.droppedCount).toBe(0);
    expect(report.balanced).toBe(true);
  });

  it("catches an item that vanished between inventory and manifest", () => {
    const objects = [detected("a", "television", 1), detected("b", "television stand", 1)];
    const report = reconcileInventory({
      detected: objects,
      inventory: inventoryOf(objects),
      // The stand never reached the manifest at all — the exact 6X regression.
      manifest: manifestOf(["a"], 1, 1),
    });
    expect(report.droppedCount).toBe(1);
    expect(report.droppedLabels).toContain("television stand");
    expect(report.balanced).toBe(false);
  });

  it("reports detected units before an inventory has been confirmed", () => {
    const objects = [detected("a", "television", 2)];
    const report = reconcileInventory({ detected: objects, inventory: null, manifest: null });
    expect(report.detectedCount).toBe(2);
    expect(report.classifiedCount).toBe(0);
  });
});

describe("Phase 6Y — click-to-arrangement measurement", () => {
  beforeEach(() => {
    resetArrangementRun();
  });

  it("reports nothing before a run has started", () => {
    const metrics = arrangementMetrics();
    expect(metrics.timeToArrangementMs).toBeNull();
    expect(metrics.withinTarget).toBe(false);
  });

  it("measures wall clock through to the painted arrangement", () => {
    startArrangementRun();
    markArrangement("inventoryReady");
    markArrangement("planReady");
    markArrangement("arrangementPaint");
    const metrics = arrangementMetrics();
    expect(metrics.timeToArrangementMs).not.toBeNull();
    expect(metrics.timeToArrangementMs!).toBeGreaterThanOrEqual(0);
    expect(metrics.planReadyMs).not.toBeNull();
  });

  it("subtracts time spent waiting for the user from the active measurement", async () => {
    startArrangementRun();
    beginUserWait();
    await new Promise((resolve) => setTimeout(resolve, 30));
    endUserWait();
    markArrangement("arrangementPaint");
    const metrics = arrangementMetrics();
    expect(metrics.userWaitMs).not.toBeNull();
    expect(metrics.userWaitMs!).toBeGreaterThan(0);
    expect(metrics.activeTimeToArrangementMs!).toBeLessThanOrEqual(metrics.timeToArrangementMs!);
  });

  it("keeps the first measurement when a stage is marked twice", () => {
    startArrangementRun();
    markArrangement("arrangementPaint");
    const first = arrangementMetrics().timeToArrangementMs;
    markArrangement("arrangementPaint");
    expect(arrangementMetrics().timeToArrangementMs).toBe(first);
  });

  it("never claims the target was met without a measurement", () => {
    startArrangementRun();
    markArrangement("inventoryReady");
    expect(arrangementMetrics().withinTarget).toBe(false);
  });
});
