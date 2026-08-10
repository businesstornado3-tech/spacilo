/**
 * Phase 6AA regression suite.
 *
 * Locks the four guarantees this phase exists to give:
 *   • multi-photo inventory is a deterministic UNION — more photos never mean
 *     fewer belongings, and two different objects never collapse into one,
 *   • the floor is the LAST resort: anything a safe surface can carry is
 *     lifted off the floor,
 *   • a photorealistic render is retried only when a redraw can actually fix
 *     the fault, and fails closed otherwise,
 *   • the manifest-ready stage is measured, never invented.
 */
import { describe, expect, it } from "vitest";

import { arrangeItems } from "./arrange";
import { liftFloorItemsOntoSurfaces } from "./optimise";
import { prefersSurface } from "./relations";
import { planningSpaceFrom } from "./space";
import type { PlanningItem } from "./types";
import type { StorageSpace } from "../types";
import {
  arrangementMetrics,
  markArrangement,
  resetArrangementRun,
  startArrangementRun,
} from "../photo/arrangement-perf";
import { mergeAcrossPhotos, isSameObjectAcrossPhotos, dimensionsAgree } from "@/lib/vision/merge";
import { mergeDetections } from "@/lib/vision/inventory";
import type { DetectedObject } from "@/lib/vision/types";
import { shouldRetryRender } from "@/hooks/useSpaceVisualisation";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const room: StorageSpace = {
  id: "phase6aa-room",
  name: "Test room",
  kind: "storage_room",
  width: 3.2,
  depth: 2.8,
  height: 2.4,
  door: "front",
  doorWidth: 0.9,
  blurb: "Test",
};

function item(partial: Partial<PlanningItem> & { id: string; label: string }): PlanningItem {
  return {
    category: "boxes",
    quantity: 1,
    widthCm: 40,
    depthCm: 40,
    heightCm: 40,
    fragile: false,
    stackable: true,
    compressible: false,
    allowUpright: false,
    wallMounted: false,
    components: [],
    weight: "light",
    confidence: 0.9,
    dimensionBasis: "estimated",
    photoIds: [],
    ...partial,
  } as PlanningItem;
}

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

/** The acceptance fixture: TV, TV stand, two suitcases and small objects. */
const fixture: PlanningItem[] = [
  item({
    id: "ITEM-tv",
    label: "Television",
    category: "electronics",
    widthCm: 120,
    depthCm: 8,
    heightCm: 70,
    fragile: true,
    stackable: false,
    weight: "medium",
  }),
  item({
    id: "ITEM-tv-stand",
    label: "TV stand",
    category: "furniture",
    widthCm: 120,
    depthCm: 45,
    heightCm: 50,
    stackable: false,
    weight: "heavy",
  }),
  item({
    id: "ITEM-suitcase-1",
    label: "Large grey suitcase",
    category: "boxes",
    widthCm: 50,
    depthCm: 30,
    heightCm: 75,
    weight: "medium",
  }),
  item({
    id: "ITEM-suitcase-2",
    label: "Small blue suitcase",
    category: "boxes",
    widthCm: 40,
    depthCm: 25,
    heightCm: 55,
    weight: "medium",
  }),
  item({ id: "ITEM-bottle", label: "Water bottle", widthCm: 8, depthCm: 8, heightCm: 28 }),
  item({ id: "ITEM-scissors", label: "Scissors", widthCm: 20, depthCm: 6, heightCm: 2 }),
];

/* ------------------------------------------------------------------ */
/* 1. Multi-photo inventory union                                      */
/* ------------------------------------------------------------------ */

describe("Phase 6AA — multi-photo inventory is a deterministic union", () => {
  it("collapses the same object seen in two photographs into one", () => {
    const merged = mergeAcrossPhotos([
      detected({ id: "a", label: "Grey suitcase", photoIds: ["photo-1"] }),
      detected({ id: "b", label: "grey suitcase", photoIds: ["photo-2"], confidence: 0.9 }),
    ]);
    expect(merged.objects).toHaveLength(1);
    expect(merged.objects[0]!.photoIds.sort()).toEqual(["photo-1", "photo-2"]);
    expect(merged.objects[0]!.confidence).toBe(0.9);
    expect(merged.report.duplicateViewsMerged).toBe(1);
  });

  it("never merges two objects seen in the SAME photograph", () => {
    const merged = mergeAcrossPhotos([
      detected({ id: "a", label: "Cardboard box", photoIds: ["photo-1"] }),
      detected({ id: "b", label: "Cardboard box", photoIds: ["photo-1"] }),
    ]);
    expect(merged.objects).toHaveLength(2);
  });

  it("keeps visually different objects apart", () => {
    const grey = detected({ id: "a", label: "Grey suitcase", photoIds: ["photo-1"] });
    const blue = detected({ id: "b", label: "Blue suitcase", photoIds: ["photo-2"] });
    expect(isSameObjectAcrossPhotos(grey, blue)).toBe(false);
    expect(mergeAcrossPhotos([grey, blue]).objects).toHaveLength(2);
  });

  it("keeps clearly different sizes apart", () => {
    const small = detected({ id: "a", label: "Box", photoIds: ["photo-1"] });
    const large = detected({
      id: "b",
      label: "Box",
      photoIds: ["photo-2"],
      width: 90,
      depth: 80,
      height: 80,
    });
    expect(dimensionsAgree(small, large)).toBe(false);
    expect(mergeAcrossPhotos([small, large]).objects).toHaveLength(2);
  });

  it("a second photograph never reduces the inventory", () => {
    const first = [detected({ id: "a", label: "Desk chair", photoIds: ["photo-1"] })];
    const second = [
      ...first,
      detected({ id: "b", label: "Floor lamp", photoIds: ["photo-2"] }),
      detected({ id: "c", label: "Desk chair", photoIds: ["photo-2"] }),
    ];
    expect(mergeAcrossPhotos(second).objects.length).toBeGreaterThanOrEqual(
      mergeAcrossPhotos(first).objects.length,
    );
    expect(mergeAcrossPhotos(second).objects).toHaveLength(2);
  });

  it("keeps the larger quantity and reports per-photo counts", () => {
    const { objects, report } = mergeAcrossPhotos([
      detected({ id: "a", label: "Storage crate", photoIds: ["photo-1"], quantity: 2 }),
      detected({ id: "b", label: "Storage crate", photoIds: ["photo-2"], quantity: 3 }),
    ]);
    expect(objects[0]!.quantity).toBe(3);
    expect(report.objectsPerPhoto).toEqual({ "photo-1": 2, "photo-2": 3 });
    expect(report.outputUnits).toBeLessThanOrEqual(report.inputUnits);
  });

  it("is order independent", () => {
    const objects = [
      detected({ id: "a", label: "Grey suitcase", photoIds: ["photo-1"] }),
      detected({ id: "b", label: "Floor lamp", photoIds: ["photo-2"] }),
      detected({ id: "c", label: "grey suitcase", photoIds: ["photo-3"] }),
    ];
    const forward = mergeAcrossPhotos(objects).objects.map((o) => o.label.toLowerCase()).sort();
    const backward = mergeAcrossPhotos([...objects].reverse())
      .objects.map((o) => o.label.toLowerCase())
      .sort();
    expect(forward).toEqual(backward);
  });

  it("mergeDetections still returns objects sorted by confidence", () => {
    const merged = mergeDetections([
      detected({ id: "a", label: "Floor lamp", confidence: 0.6, photoIds: ["photo-1"] }),
      detected({ id: "b", label: "Desk chair", confidence: 0.95, photoIds: ["photo-2"] }),
    ]);
    expect(merged.map((object) => object.id)).toEqual(["b", "a"]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Vertical storage — the floor is the last resort                  */
/* ------------------------------------------------------------------ */

describe("Phase 6AA — floor is the last resort", () => {
  it("treats modest non-heavy objects as surface seeking", () => {
    expect(prefersSurface(item({ id: "i", label: "Water bottle", widthCm: 8, depthCm: 8, heightCm: 28 }))).toBe(true);
    expect(
      prefersSurface(
        item({
          id: "i",
          label: "Storage crate",
          widthCm: 45,
          depthCm: 35,
          heightCm: 35,
          weight: "medium",
        }),
      ),
    ).toBe(true);
    expect(
      prefersSurface(
        item({
          id: "i",
          label: "Chest of drawers",
          category: "furniture",
          widthCm: 90,
          depthCm: 50,
          heightCm: 110,
          weight: "heavy",
        }),
      ),
    ).toBe(false);
  });

  it("places the small objects of the acceptance fixture above the floor", () => {
    const space = planningSpaceFrom(room);
    const arrangement = arrangeItems(fixture, space);
    const bottle = arrangement.entries.find((entry) => entry.itemId === "ITEM-bottle");
    const scissors = arrangement.entries.find((entry) => entry.itemId === "ITEM-scissors");
    expect(bottle).toBeTruthy();
    expect(scissors).toBeTruthy();
    for (const entry of [bottle!, scissors!]) {
      expect(entry.baseHeightM).toBeGreaterThan(0);
      expect(entry.supportedBy).toBeTruthy();
    }
  });

  it("never rests anything on a suitcase", () => {
    const space = planningSpaceFrom(room);
    const arrangement = arrangeItems(fixture, space);
    const suitcaseIds = ["ITEM-suitcase-1", "ITEM-suitcase-2"];
    for (const entry of arrangement.entries) {
      if (entry.supportedBy) expect(suitcaseIds).not.toContain(entry.supportedBy);
    }
  });

  it("places every item in the acceptance fixture", () => {
    const space = planningSpaceFrom(room);
    const arrangement = arrangeItems(fixture, space);
    const placedIds = new Set(arrangement.entries.map((entry) => entry.itemId));
    for (const fixtureItem of fixture) expect(placedIds.has(fixtureItem.id)).toBe(true);
  });

  it("is deterministic across repeated runs", () => {
    const space = planningSpaceFrom(room);
    const first = JSON.stringify(arrangeItems(fixture, space).entries);
    const second = JSON.stringify(arrangeItems(fixture, space).entries);
    expect(first).toEqual(second);
  });

  it("liftFloorItemsOntoSurfaces moves nothing when no safe base exists", () => {
    const placed = [
      {
        item: item({ id: "ITEM-bottle", label: "Water bottle", widthCm: 8, depthCm: 8, heightCm: 28 }),
        cls: "SMALL_ITEM" as const,
        entry: {
          key: "a",
          itemId: "ITEM-bottle",
          label: "Water bottle",
          units: 1,
          x: 0,
          y: 0,
          w: 0.08,
          d: 0.08,
          heightM: 0.28,
          baseHeightM: 0,
          layer: 0,
          rotationDeg: 0,
          orientation: "flat" as const,
          zone: "front" as const,
          storageZone: "floor" as const,
          supportsItemIds: [],
          supportedBy: null,
          groupId: "group-small-items",
          fragile: false,
          weight: "light" as const,
          confidence: 0.9,
          mounted: false,
        },
      },
    ];
    const lifted = liftFloorItemsOntoSurfaces(placed as never, new Map(), new Map(), 2.4);
    expect(lifted).toBe(0);
    expect(placed[0]!.entry.supportedBy).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 3. Render reliability — fail closed                                 */
/* ------------------------------------------------------------------ */

describe("Phase 6AA — render retries are spent only where they help", () => {
  it("retries once when items the plan asked for are missing", () => {
    expect(shouldRetryRender({ missing: ["Television"] })).toBe(true);
  });

  it("never retries an invented object", () => {
    expect(shouldRetryRender({ missing: ["Television"], unexpected: ["shoes"] })).toBe(false);
    expect(shouldRetryRender({ missing: [], unexpected: ["shoes"] })).toBe(false);
  });

  it("never retries a refused support relationship", () => {
    expect(shouldRetryRender({ missing: [], supportIssues: [{ itemId: "ITEM-tv" }] })).toBe(false);
  });

  it("does not retry a faithful render", () => {
    expect(shouldRetryRender({ missing: [], unexpected: [], supportIssues: [] })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Measured performance stages                                      */
/* ------------------------------------------------------------------ */

describe("Phase 6AA — the manifest stage is measured, never invented", () => {
  it("reports no manifest timing before the stage is reached", () => {
    resetArrangementRun();
    startArrangementRun();
    expect(arrangementMetrics().manifestValidatedMs).toBeNull();
  });

  it("reports the manifest stage once it happens, before the paint", () => {
    resetArrangementRun();
    startArrangementRun();
    markArrangement("manifestValidated");
    markArrangement("arrangementPaint");
    const metrics = arrangementMetrics();
    expect(metrics.manifestValidatedMs).not.toBeNull();
    expect(metrics.timeToArrangementMs).not.toBeNull();
    expect(metrics.manifestValidatedMs!).toBeLessThanOrEqual(metrics.timeToArrangementMs!);
  });
});
