/**
 * Phase 6AB regression suite — multi-photo identity, bounded rendering and
 * honest performance reporting.
 *
 * The guarantees locked here:
 *   • the same physical object photographed from several angles is ONE object
 *     in the inventory, whatever the wording of its label,
 *   • genuinely distinct objects of the same type stay distinct,
 *   • nothing is ever deleted by identity resolution, and every decision has
 *     a reason a human can read,
 *   • the renderer sees one reference photograph per physical object,
 *   • an optional preview can never produce a 90–120 second dead wait,
 *   • a missed 5-second target is reported as OVER BUDGET, never as success.
 */
import { describe, expect, it } from "vitest";

import {
  identityOf,
  labelsDescribeSameObject,
  mergeAcrossPhotos,
  resolveIdentity,
} from "@/lib/vision/merge";
import { mergeDetections, mergeDetectionsWithReport } from "@/lib/vision/inventory";
import type { DetectedObject } from "@/lib/vision/types";
import type { VisionPhoto } from "@/lib/vision/types";
import {
  MAX_RENDER_ATTEMPTS,
  RENDER_TIMEOUT_MS,
  representativeItemPhotos,
  shouldRetryRender,
  showsRenderedImage,
} from "@/hooks/useSpaceVisualisation";
import {
  ARRANGEMENT_VISIBLE_BUDGET_MS,
  EMPTY_TIMINGS,
  budgetReport,
} from "./timings";

function detected(partial: Partial<DetectedObject> & { id: string; label: string }): DetectedObject {
  return {
    category: "boxes",
    confidence: 0.8,
    width: 40,
    depth: 40,
    height: 40,
    weight: "medium",
    quantity: 1,
    fragile: false,
    stackable: true,
    catalogueId: null,
    photoIds: ["photo-1"],
    source: "ai",
    ...partial,
  } as DetectedObject;
}

const tv = (id: string, photo: string, label = "Television", extra: Partial<DetectedObject> = {}) =>
  detected({
    id,
    label,
    category: "electronics",
    width: 120,
    depth: 8,
    height: 70,
    fragile: true,
    photoIds: [photo],
    ...extra,
  });

const photo = (id: string): VisionPhoto => ({
  id,
  name: `${id}.jpg`,
  url: `blob:${id}`,
  sizeBytes: 1000,
  mimeType: "image/jpeg",
  rotation: 0,
  addedAt: 0,
});

/* ------------------------------------------------------------------ */
/* E–I. Multi-photo identity                                           */
/* ------------------------------------------------------------------ */

describe("Phase 6AB — multi-photo identity resolution", () => {
  it("treats the same TV in two photos as one physical object", () => {
    const merged = mergeDetections([tv("a", "photo-1"), tv("b", "photo-2")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quantity).toBe(1);
    expect(merged[0]!.photoIds).toEqual(["photo-1", "photo-2"]);
  });

  it("treats the same TV in three photos as one physical object", () => {
    const merged = mergeDetections([
      tv("a", "photo-1"),
      tv("b", "photo-2", "black TV"),
      tv("c", "photo-3", "flat television"),
    ]);
    const televisions = merged.filter((object) => identityOf(object.label).includes("tv") || identityOf(object.label).includes("television"));
    expect(televisions).toHaveLength(1);
    expect(televisions[0]!.quantity).toBe(1);
    expect(televisions[0]!.photoIds).toHaveLength(3);
  });

  it("keeps two genuinely different TVs apart", () => {
    const merged = mergeDetections([
      tv("a", "photo-1", "Television"),
      tv("b", "photo-1", "Television"),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps one TV per photo when both photos show two TVs", () => {
    const merged = mergeDetections([
      tv("a", "photo-1", "large television", { width: 140, height: 82 }),
      tv("b", "photo-1", "small television", { width: 70, height: 42 }),
      tv("c", "photo-2", "large television", { width: 140, height: 82 }),
      tv("d", "photo-2", "small television", { width: 70, height: 42 }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every((object) => object.quantity === 1)).toBe(true);
  });

  it("merges the same grey suitcase photographed twice", () => {
    const merged = mergeDetections([
      detected({ id: "a", label: "grey suitcase", category: "leisure", width: 45, depth: 25, height: 65, photoIds: ["photo-1"] }),
      detected({ id: "b", label: "grey suitcase", category: "leisure", width: 48, depth: 28, height: 62, photoIds: ["photo-2"] }),
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps a grey suitcase and a blue suitcase apart", () => {
    const merged = mergeDetections([
      detected({ id: "a", label: "grey suitcase", category: "leisure", photoIds: ["photo-1"] }),
      detected({ id: "b", label: "blue suitcase", category: "leisure", photoIds: ["photo-2"] }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps a small and a large blue suitcase apart on dimensions", () => {
    const verdict = resolveIdentity(
      detected({ id: "a", label: "blue suitcase", category: "leisure", width: 35, depth: 20, height: 50, photoIds: ["photo-1"] }),
      detected({ id: "b", label: "blue suitcase", category: "leisure", width: 55, depth: 35, height: 80, photoIds: ["photo-2"] }),
    );
    expect(verdict.same).toBe(false);
    expect(verdict.reason).toBe("different dimensions");
  });

  it("merges the same laptop bag photographed twice, unlabelled colour on one side", () => {
    const merged = mergeDetections([
      detected({ id: "a", label: "black laptop bag", category: "leisure", width: 40, depth: 12, height: 30, photoIds: ["photo-1"] }),
      detected({ id: "b", label: "laptop bag", category: "leisure", width: 42, depth: 14, height: 31, photoIds: ["photo-2"] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.photoIds).toEqual(["photo-1", "photo-2"]);
  });

  it("keeps different bags with different dimensions separate", () => {
    const merged = mergeDetections([
      detected({ id: "a", label: "holdall", category: "leisure", width: 60, depth: 30, height: 35, photoIds: ["photo-1"] }),
      detected({ id: "b", label: "holdall", category: "leisure", width: 25, depth: 15, height: 18, photoIds: ["photo-2"] }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("reports more raw detections than unique physical objects", () => {
    const { report } = mergeDetectionsWithReport([
      tv("a", "photo-1"),
      tv("b", "photo-2"),
      detected({ id: "c", label: "grey suitcase", category: "leisure", photoIds: ["photo-1"] }),
      detected({ id: "d", label: "grey suitcase", category: "leisure", photoIds: ["photo-2"] }),
    ]);
    expect(report.rawDetectionCount).toBe(4);
    expect(report.uniquePhysicalObjectCount).toBe(2);
    expect(report.mergedViewCount).toBe(2);
    expect(report.objectsPerPhoto["photo-1"]).toBe(2);
  });

  it("never deletes a legitimate object during identity resolution", () => {
    const objects = [
      tv("a", "photo-1"),
      detected({ id: "b", label: "grey suitcase", category: "leisure", photoIds: ["photo-1"] }),
      detected({ id: "c", label: "blue suitcase", category: "leisure", photoIds: ["photo-1"] }),
      detected({ id: "d", label: "water bottle", width: 8, depth: 8, height: 25, photoIds: ["photo-1"] }),
    ];
    expect(mergeDetections(objects)).toHaveLength(4);
  });

  it("records a readable reason for every merge and near-miss", () => {
    const { report } = mergeDetectionsWithReport([
      tv("a", "photo-1"),
      tv("b", "photo-2"),
      detected({ id: "c", label: "grey suitcase", category: "leisure", width: 35, depth: 20, height: 50, photoIds: ["photo-1"] }),
      detected({ id: "d", label: "grey suitcase", category: "leisure", width: 60, depth: 40, height: 85, photoIds: ["photo-2"] }),
    ]);
    expect(report.decisions.some((entry) => entry.kind === "merged")).toBe(true);
    expect(report.decisions.some((entry) => entry.kind === "retained" && entry.reason === "different dimensions")).toBe(true);
    for (const decision of report.decisions) expect(decision.reason.length).toBeGreaterThan(3);
  });

  it("keeps every source photo id on a merged object", () => {
    const { objects } = mergeAcrossPhotos([tv("a", "photo-1"), tv("b", "photo-2"), tv("c", "photo-3")]);
    expect(objects[0]!.photoIds).toEqual(["photo-1", "photo-2", "photo-3"]);
    expect(objects[0]!.identityGroupId).toBe("a");
  });

  it("matches labels by noun, not by wording", () => {
    expect(labelsDescribeSameObject("black TV", "TV")).toBe(true);
    expect(labelsDescribeSameObject("grey suitcase", "blue suitcase")).toBe(false);
    expect(labelsDescribeSameObject("cardboard box", "wooden box")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* V. Representative render references                                 */
/* ------------------------------------------------------------------ */

describe("Phase 6AB — representative render references", () => {
  it("sends one reference photo when both photos show the same objects", () => {
    const objects = mergeDetections([tv("a", "photo-1"), tv("b", "photo-2")]);
    const chosen = representativeItemPhotos([photo("photo-1"), photo("photo-2")], objects, 3);
    expect(chosen).toHaveLength(1);
  });

  it("sends both photos when each contributes a different object", () => {
    const objects = [
      tv("a", "photo-1"),
      detected({ id: "b", label: "grey suitcase", category: "leisure", photoIds: ["photo-2"] }),
    ];
    const chosen = representativeItemPhotos([photo("photo-1"), photo("photo-2")], objects, 3);
    expect(chosen).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Q–S. Bounded, fail-closed rendering                                 */
/* ------------------------------------------------------------------ */

describe("Phase 6AB — bounded optional preview", () => {
  it("bounds a single render attempt well below a minute", () => {
    expect(RENDER_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
  });

  it("cannot produce a 90-second wait across the whole attempt budget", () => {
    expect(RENDER_TIMEOUT_MS * MAX_RENDER_ATTEMPTS).toBeLessThan(95_000);
  });

  it("only ever displays a verified image", () => {
    for (const status of ["idle", "preparing", "rendering", "verifying", "unfaithful", "incomplete", "unverified", "failed"] as const) {
      expect(showsRenderedImage(status)).toBe(false);
    }
    expect(showsRenderedImage("verified")).toBe(true);
  });

  it("retries only for missing legitimate objects", () => {
    expect(shouldRetryRender({ missing: ["ITEM-1"] })).toBe(true);
    expect(shouldRetryRender({ missing: ["ITEM-1"], unexpected: ["shoes"] })).toBe(false);
    expect(shouldRetryRender({ missing: ["ITEM-1"], supportIssues: ["tv on floor"] })).toBe(false);
    expect(shouldRetryRender({ missing: [] })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* B / Y. Honest performance reporting                                 */
/* ------------------------------------------------------------------ */

describe("Phase 6AB — honest performance reporting", () => {
  it("reports a missed arrangement target as over budget with the slowest stage", () => {
    const report = budgetReport({
      ...EMPTY_TIMINGS,
      detectionMs: 9000,
      planMs: 20,
      activeTimeToArrangementMs: 9600,
    });
    expect(report.arrangement.state).toBe("over");
    expect(report.arrangement.overBy).toBe(9600 - ARRANGEMENT_VISIBLE_BUDGET_MS);
    expect(report.bottleneck).toBe("detection");
    expect(report.allWithinBudget).toBe(false);
  });

  it("never claims success for an unmeasured journey", () => {
    expect(budgetReport(EMPTY_TIMINGS).allWithinBudget).toBe(false);
  });
});
