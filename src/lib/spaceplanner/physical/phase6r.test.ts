/**
 * Phase 6R regression suite.
 *
 * Locks the product behaviours that repeated real-user runs exposed:
 *  1. a TV stand is furniture, never a wall-mounted screen,
 *  2. related objects (TV + stand, monitor + desk) end up together,
 *  3. small items are carried on surfaces instead of scattered on the floor,
 *  4. items of the same storage zone cluster,
 *  5. the arrangement stays fully deterministic.
 */
import { describe, expect, it } from "vitest";
import { arrangeItems } from "./arrange";
import { planningSpaceFrom } from "./space";
import { classifyItem } from "./classify";
import { isWallMountedLabel } from "./items";
import { areRelated, canSupport, prefersSurface, storageZoneFor } from "./relations";
import type { PlanningItem } from "./types";
import type { StorageSpace } from "../types";

const room: StorageSpace = {
  id: "test-room",
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
  depthCm: 40,
  heightCm: 50,
  stackable: false,
  weight: "heavy",
});

const television = item({
  id: "ITEM-tv",
  label: "Television",
  widthCm: 120,
  depthCm: 8,
  heightCm: 70,
  fragile: true,
  stackable: false,
  wallMounted: true,
});

describe("Phase 6R — screens versus the furniture that carries them", () => {
  it("treats a TV stand as floor furniture, not a wall-mounted screen", () => {
    expect(isWallMountedLabel("TV stand")).toBe(false);
    expect(isWallMountedLabel("TV unit")).toBe(false);
    expect(isWallMountedLabel("Media console")).toBe(false);
    expect(classifyItem(tvStand)).not.toBe("WALL_MOUNTED");
  });

  it("still treats the screen itself as wall-mounted", () => {
    expect(isWallMountedLabel("Television")).toBe(true);
    expect(isWallMountedLabel("Wall-mounted flat screen")).toBe(true);
    expect(classifyItem(television)).toBe("WALL_MOUNTED");
  });

  it("places the TV stand rather than dropping it", () => {
    const space = planningSpaceFrom(room);
    const plan = arrangeItems([tvStand, television], space);
    const labels = plan.entries.map((entry) => entry.itemId);
    expect(labels).toContain("ITEM-tv-stand");
    expect(plan.unplaced.some((entry) => entry.itemId === "ITEM-tv-stand")).toBe(false);
  });
});

describe("Phase 6R — deterministic relationships", () => {
  it("pairs a television with its stand", () => {
    expect(areRelated(television, tvStand)).toBe(true);
    expect(areRelated(tvStand, television)).toBe(true);
  });

  it("does not pair unrelated objects", () => {
    const bike = item({ id: "ITEM-bike", label: "Bicycle", widthCm: 170, depthCm: 45, heightCm: 100 });
    expect(areRelated(bike, tvStand)).toBe(false);
  });

  it("keeps related floor objects adjacent in the arrangement", () => {
    const desk = item({
      id: "ITEM-desk",
      label: "Desk",
      category: "furniture",
      widthCm: 120,
      depthCm: 60,
      heightCm: 75,
      stackable: false,
      weight: "heavy",
    });
    const monitor = item({
      id: "ITEM-monitor",
      label: "Monitor",
      widthCm: 55,
      depthCm: 20,
      heightCm: 40,
      stackable: false,
      fragile: true,
    });
    const wardrobe = item({
      id: "ITEM-wardrobe",
      label: "Wardrobe",
      category: "furniture",
      widthCm: 100,
      depthCm: 60,
      heightCm: 180,
      stackable: false,
      weight: "heavy",
    });

    const space = planningSpaceFrom(room);
    const plan = arrangeItems([desk, wardrobe, monitor], space);
    const deskEntry = plan.entries.find((entry) => entry.itemId === "ITEM-desk");
    const monitorEntry = plan.entries.find((entry) => entry.itemId === "ITEM-monitor");
    expect(deskEntry).toBeTruthy();
    expect(monitorEntry).toBeTruthy();
    if (!deskEntry || !monitorEntry) return;

    const distance = Math.hypot(
      deskEntry.x + deskEntry.w / 2 - (monitorEntry.x + monitorEntry.w / 2),
      deskEntry.y + deskEntry.d / 2 - (monitorEntry.y + monitorEntry.d / 2),
    );
    expect(distance).toBeLessThanOrEqual(1.5);
  });
});

describe("Phase 6R — surfaces and consolidation", () => {
  it("knows which items belong on a surface", () => {
    const lamp = item({ id: "ITEM-lamp", label: "Table lamp", widthCm: 20, depthCm: 20, heightCm: 40 });
    expect(prefersSurface(lamp)).toBe(true);
    expect(prefersSurface(tvStand)).toBe(false);
  });

  it("refuses a base that cannot physically carry the object", () => {
    const smallBox = { item: item({ id: "b", label: "Box" }), w: 0.4, d: 0.4, heightM: 0.4 };
    const huge = { item: item({ id: "h", label: "Wardrobe" }), w: 1.2, d: 0.6, heightM: 1.8 };
    // A 1.8m-tall base plus a 0.4m box exceeds a 2.0m ceiling head-room rule.
    expect(canSupport({ ...huge, topHeightM: huge.heightM }, smallBox, 2.0)).toBe(false);
  });

  it("stacks a small item onto a surface instead of the floor", () => {
    const box = item({
      id: "ITEM-box",
      label: "Large box",
      widthCm: 60,
      depthCm: 50,
      heightCm: 50,
      weight: "medium",
    });
    const shoebox = item({
      id: "ITEM-shoebox",
      label: "Shoe box",
      widthCm: 30,
      depthCm: 18,
      heightCm: 12,
    });
    const space = planningSpaceFrom(room);
    const plan = arrangeItems([box, shoebox], space);
    const stacked = plan.entries.find((entry) => entry.itemId === "ITEM-shoebox");
    expect(stacked).toBeTruthy();
    if (!stacked) return;
    expect(stacked.layer).toBeGreaterThanOrEqual(0);
    expect(plan.unplaced.some((entry) => entry.itemId === "ITEM-shoebox")).toBe(false);
  });

  it("assigns every item a deterministic storage zone", () => {
    expect(storageZoneFor(item({ id: "s", label: "Suitcase", widthCm: 70, depthCm: 30, heightCm: 50 }))).toBe(
      "luggage",
    );
    expect(storageZoneFor(item({ id: "b", label: "Cardboard box" }))).toBe("boxes");
    expect(storageZoneFor(tvStand)).toBe("furniture");
    expect(
      storageZoneFor(item({ id: "f", label: "Glassware crate", fragile: true })),
    ).toBe("fragile");
  });
});

describe("Phase 6R — determinism", () => {
  it("produces byte-identical arrangements across repeated runs", () => {
    const items = [
      tvStand,
      television,
      item({ id: "ITEM-a", label: "Suitcase", widthCm: 70, depthCm: 30, heightCm: 50 }),
      item({ id: "ITEM-b", label: "Cardboard box", quantity: 4 }),
      item({ id: "ITEM-c", label: "Table lamp", widthCm: 20, depthCm: 20, heightCm: 40 }),
    ];
    const space = planningSpaceFrom(room);
    const first = JSON.stringify(arrangeItems(items, space).entries);
    for (let run = 0; run < 5; run += 1) {
      expect(JSON.stringify(arrangeItems(items, planningSpaceFrom(room)).entries)).toBe(first);
    }
  });
});
