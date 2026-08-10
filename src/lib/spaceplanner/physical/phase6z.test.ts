/**
 * Phase 6Z regression suite.
 *
 * Locks the behaviours this phase exists to guarantee:
 *   • small objects go on safe flat surfaces before they ever take floor,
 *   • several small objects share one surface as a real 2D packing,
 *   • suitcases, holdalls, backpacks and soft goods are never load-bearing,
 *   • surface boundaries are respected and support relationships recorded,
 *   • wasted floor is materially penalised by the objective,
 *   • the whole arrangement stays deterministic,
 *   • the click → arrangement-painted metric is measured, never invented.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { arrangeItems } from "./arrange";
import { arrangementObjective } from "./optimise";
import { canSupport, isSafeSupportSurface, isRenderableSupport } from "./relations";
import { planningSpaceFrom } from "./space";
import {
  FLOOR_OCCUPATION_PENALTY,
  packOnSurface,
  scoreSurfaceCandidate,
  smallFloorFootprint,
  usableSurfaceRect,
} from "./surfaces";
import type { PlanningItem, Rect } from "./types";
import type { StorageSpace } from "../types";
import {
  arrangementMetrics,
  markArrangement,
  resetArrangementRun,
  startArrangementRun,
} from "../photo/arrangement-perf";

const room: StorageSpace = {
  id: "phase6z-room",
  name: "Test room",
  kind: "storage_room",
  width: 3.4,
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

const tvStand = item({
  id: "ITEM-tv-stand",
  label: "TV stand",
  category: "furniture",
  widthCm: 120,
  depthCm: 45,
  heightCm: 50,
  stackable: false,
  weight: "heavy",
});

const table = item({
  id: "ITEM-table",
  label: "Folding table",
  category: "furniture",
  widthCm: 100,
  depthCm: 60,
  heightCm: 72,
  stackable: false,
  weight: "medium",
});

const shelf = item({
  id: "ITEM-shelf",
  label: "Shelf unit",
  category: "furniture",
  widthCm: 80,
  depthCm: 35,
  heightCm: 90,
  stackable: false,
  weight: "medium",
});

const greySuitcase = item({
  id: "ITEM-suitcase-grey",
  label: "Grey suitcase",
  category: "luggage",
  widthCm: 50,
  depthCm: 30,
  heightCm: 75,
  stackable: false,
  weight: "medium",
});

const backpack = item({
  id: "ITEM-backpack",
  label: "Black laptop backpack",
  category: "bags",
  widthCm: 35,
  depthCm: 20,
  heightCm: 45,
  compressible: true,
  weight: "light",
});

const holdall = item({
  id: "ITEM-holdall",
  label: "Black holdall",
  category: "bags",
  widthCm: 60,
  depthCm: 30,
  heightCm: 30,
  compressible: true,
  weight: "light",
});

const bedding = item({
  id: "ITEM-bedding",
  label: "Bedding bundle",
  category: "soft",
  widthCm: 60,
  depthCm: 40,
  heightCm: 30,
  compressible: true,
  weight: "light",
});

const bottle = item({
  id: "ITEM-bottle",
  label: "Water bottle",
  category: "small",
  widthCm: 10,
  depthCm: 10,
  heightCm: 28,
  weight: "light",
});

const scissors = item({
  id: "ITEM-scissors",
  label: "Scissors",
  category: "small",
  widthCm: 20,
  depthCm: 8,
  heightCm: 3,
  weight: "light",
});

const toy = item({
  id: "ITEM-toy",
  label: "Toy",
  category: "small",
  widthCm: 22,
  depthCm: 16,
  heightCm: 14,
  weight: "light",
});

const space = planningSpaceFrom(room);

function entryFor(entries: ReturnType<typeof arrangeItems>["entries"], id: string) {
  return entries.find((entry) => entry.itemId === id) ?? null;
}

/* ------------------------------------------------- surface packing */

describe("Phase 6Z — a surface is a finite 2D packing area", () => {
  const surface: Rect = { x: 0, y: 0, w: 1.2, d: 0.45 };

  it("keeps every packed object inside the surface boundary", () => {
    const first = packOnSurface(surface, [], 0.3, 0.2)!;
    expect(first).not.toBeNull();
    expect(first.rect.x).toBeGreaterThanOrEqual(surface.x);
    expect(first.rect.x + first.rect.w).toBeLessThanOrEqual(surface.x + surface.w + 0.001);
    expect(first.rect.y + first.rect.d).toBeLessThanOrEqual(surface.y + surface.d + 0.001);
  });

  it("lets several objects share one surface without overlapping", () => {
    const occupied: Rect[] = [];
    for (const size of [
      [0.3, 0.2],
      [0.25, 0.2],
      [0.2, 0.15],
    ] as const) {
      const fit = packOnSurface(surface, occupied, size[0], size[1]);
      expect(fit).not.toBeNull();
      occupied.push(fit!.rect);
    }
    expect(occupied).toHaveLength(3);
    for (let i = 0; i < occupied.length; i += 1) {
      for (let j = i + 1; j < occupied.length; j += 1) {
        const a = occupied[i]!;
        const b = occupied[j]!;
        const overlap =
          a.x < b.x + b.w - 0.001 &&
          b.x < a.x + a.w - 0.001 &&
          a.y < b.y + b.d - 0.001 &&
          b.y < a.y + a.d - 0.001;
        expect(overlap).toBe(false);
      }
    }
  });

  it("refuses an object the surface genuinely cannot hold", () => {
    expect(packOnSurface(surface, [], 2, 2)).toBeNull();
  });

  it("insets the usable rectangle inside the base footprint", () => {
    const usable = usableSurfaceRect({ x: 1, y: 1, w: 1.2, d: 0.45 });
    expect(usable.x).toBeGreaterThan(1);
    expect(usable.w).toBeLessThan(1.2);
    expect(usable.d).toBeLessThan(0.45);
  });

  it("is deterministic for identical input", () => {
    const a = packOnSurface(surface, [{ x: 0, y: 0, w: 0.3, d: 0.2 }], 0.25, 0.2);
    const b = packOnSurface(surface, [{ x: 0, y: 0, w: 0.3, d: 0.2 }], 0.25, 0.2);
    expect(a).toEqual(b);
  });

  it("prefers a related, renderable, lower surface", () => {
    const fit = { rect: { x: 0, y: 0, w: 0.2, d: 0.2 }, rotationDeg: 0 as const, utilisation: 0.4 };
    const onStand = scoreSurfaceCandidate({
      baseItem: tvStand,
      baseTopHeightM: 0.5,
      fit,
      related: true,
    });
    const onShelf = scoreSurfaceCandidate({
      baseItem: shelf,
      baseTopHeightM: 0.9,
      fit,
      related: false,
    });
    expect(onStand).toBeGreaterThan(onShelf);
  });
});

/* --------------------------------------------- unsafe base rejection */

describe("Phase 6Z — nothing is ever stood on luggage or soft goods", () => {
  it.each([
    ["grey suitcase", greySuitcase],
    ["backpack", backpack],
    ["holdall", holdall],
    ["bedding", bedding],
  ])("rejects %s as a support surface", (_label, base) => {
    expect(isSafeSupportSurface(base)).toBe(false);
    expect(
      canSupport(
        { item: base, w: 0.5, d: 0.3, topHeightM: 0.4 },
        { item: bottle, w: 0.1, d: 0.1, heightM: 0.28 },
        2.4,
      ),
    ).toBe(false);
  });

  it("accepts genuine furniture as a support surface", () => {
    for (const base of [tvStand, table, shelf]) {
      expect(isSafeSupportSurface(base)).toBe(true);
      expect(isRenderableSupport(base.label)).toBe(true);
    }
  });
});

/* ------------------------------------------- arrangement behaviour */

describe("Phase 6Z — small objects leave the floor when a surface exists", () => {
  const withStand = arrangeItems([tvStand, greySuitcase, bottle, scissors, toy], space);

  it("places every small object on the stand rather than the floor", () => {
    for (const small of [bottle, scissors, toy]) {
      const entry = entryFor(withStand.entries, small.id);
      expect(entry, `${small.label} must survive the pipeline`).not.toBeNull();
      expect(entry!.layer).toBeGreaterThan(0);
      expect(entry!.supportedBy).toBe(tvStand.id);
    }
  });

  it("records the support relationship on both sides", () => {
    const base = entryFor(withStand.entries, tvStand.id)!;
    expect(base.supportsItemIds).toEqual(
      expect.arrayContaining([bottle.id, scissors.id, toy.id]),
    );
  });

  it("never selects the suitcase as the base", () => {
    for (const entry of withStand.entries) {
      expect(entry.supportedBy).not.toBe(greySuitcase.id);
    }
  });

  it("keeps supported objects inside their base footprint", () => {
    const base = entryFor(withStand.entries, tvStand.id)!;
    for (const entry of withStand.entries.filter((e) => e.supportedBy === tvStand.id)) {
      expect(entry.x).toBeGreaterThanOrEqual(base.x - 0.001);
      expect(entry.y).toBeGreaterThanOrEqual(base.y - 0.001);
      expect(entry.x + entry.w).toBeLessThanOrEqual(base.x + base.w + 0.001);
      expect(entry.y + entry.d).toBeLessThanOrEqual(base.y + base.d + 0.001);
      expect(entry.baseHeightM).toBeCloseTo(base.heightM, 5);
    }
  });

  it("falls back to the floor only when no safe surface exists", () => {
    const noSurface = arrangeItems([greySuitcase, backpack, bottle, scissors], space);
    const onFloor = [bottle, scissors]
      .map((small) => entryFor(noSurface.entries, small.id))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    expect(onFloor.length).toBeGreaterThan(0);
    for (const entry of onFloor) {
      expect(entry.layer).toBe(0);
      expect(entry.supportedBy).toBeNull();
    }
  });

  it("produces identical coordinates for identical input", () => {
    const again = arrangeItems([tvStand, greySuitcase, bottle, scissors, toy], space);
    expect(again.entries).toEqual(withStand.entries);
  });

  it("drops nothing: every item is placed or explicitly unplaced", () => {
    const items = [tvStand, greySuitcase, bottle, scissors, toy];
    for (const source of items) {
      const known =
        withStand.entries.some((entry) => entry.itemId === source.id) ||
        withStand.unplaced.some((entry) => entry.itemId === source.id);
      expect(known, `${source.label} vanished`).toBe(true);
    }
  });
});

/* ----------------------------------------------- floor-space penalty */

describe("Phase 6Z — wasted floor is penalised, not tolerated", () => {
  const floorEntries = [
    { layer: 0, w: 0.2, d: 0.2 },
    { layer: 0, w: 0.2, d: 0.15 },
    { layer: 0, w: 1.2, d: 0.45 },
  ];

  it("counts only small footprints left on the floor", () => {
    const wasted = smallFloorFootprint(floorEntries, 0.12);
    expect(wasted).toBeCloseTo(0.07, 5);
  });

  it("ignores footprints that have been lifted onto a surface", () => {
    const lifted = smallFloorFootprint(
      floorEntries.map((entry) => ({ ...entry, layer: 1 })),
      0.12,
    );
    expect(lifted).toBe(0);
  });

  it("materially changes the objective", () => {
    // Phase 6AC rebalanced this: still decisive, no longer so large that the
    // optimiser builds unstable towers just to empty the floor.
    expect(FLOOR_OCCUPATION_PENALTY).toBeGreaterThanOrEqual(10);
    const base = [
      { key: "a", layer: 0, x: 0, y: 0, w: 1.2, d: 0.45 },
      { key: "b", layer: 0, x: 1.2, y: 0, w: 0.5, d: 0.3 },
    ] as never[];
    const scattered = [
      ...base,
      { key: "c", layer: 0, x: 1.7, y: 0, w: 0.2, d: 0.2 },
    ] as never[];
    const stacked = [
      ...base,
      { key: "c", layer: 1, x: 0, y: 0, w: 0.2, d: 0.2 },
    ] as never[];
    expect(arrangementObjective(stacked, space)).toBeGreaterThan(
      arrangementObjective(scattered, space),
    );
  });
});

/* ------------------------------------------------------ performance */

describe("Phase 6Z — click → arrangement painted is measured, never invented", () => {
  beforeEach(() => resetArrangementRun());

  it("reports unknown until the arrangement has actually painted", () => {
    startArrangementRun();
    markArrangement("inventoryReady");
    markArrangement("spaceReady");
    markArrangement("planReady");
    const metrics = arrangementMetrics();
    expect(metrics.timeToArrangementMs).toBeNull();
    expect(metrics.arrangementPaintMs).toBeNull();
    expect(metrics.withinTarget).toBe(false);
  });

  it("separates the paint cost from the analysis that preceded it", () => {
    startArrangementRun();
    markArrangement("inventoryReady");
    markArrangement("spaceReady");
    markArrangement("planReady");
    markArrangement("arrangementPaint");
    const metrics = arrangementMetrics();
    expect(metrics.spaceReadyMs).not.toBeNull();
    expect(metrics.planReadyMs).not.toBeNull();
    expect(metrics.timeToArrangementMs).not.toBeNull();
    expect(metrics.arrangementPaintMs).toBe(
      metrics.timeToArrangementMs! - metrics.planReadyMs!,
    );
  });

  it("never reports a target verdict without a measurement", () => {
    expect(arrangementMetrics().withinTarget).toBe(false);
  });
});
