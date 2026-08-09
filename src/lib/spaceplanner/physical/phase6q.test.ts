/**
 * Phase 6Q regression suite.
 *
 * Locks the three failures observed on the live 18-item run:
 *  1. a wall-mounted television silently disappearing,
 *  2. a room measured as the marked storage strip,
 *  3. scattered, unoptimised small items.
 */
import { describe, expect, it } from "vitest";
import { arrangeItems } from "./arrange";
import { planningSpaceFrom } from "./space";
import { classify } from "./classify";
import { validateRoomGeometry, longestWallRun } from "../room-geometry";
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
    quantity: 1,
    widthCm: 40,
    depthCm: 40,
    heightCm: 40,
    fragile: false,
    stackable: true,
    maxStack: 3,
    weight: "light",
    standsUpright: false,
    frequentlyUsed: false,
    confidence: 0.9,
    ...partial,
  } as PlanningItem;
}

const tv = item({
  id: "ITEM-tv",
  label: "Television",
  widthCm: 120,
  depthCm: 8,
  heightCm: 70,
  fragile: true,
  stackable: false,
  maxStack: 1,
  wallMounted: true,
} as Partial<PlanningItem> & { id: string; label: string });

describe("Phase 6Q — room geometry", () => {
  it("flags a room narrower than any real room as needing confirmation", () => {
    const result = validateRoomGeometry({
      roomWidthM: 1.1,
      roomDepthM: 2.3,
      roomHeightM: 2.4,
      basis: "photo-room",
      confidence: 0.55,
    });
    expect(result.needsConfirmation).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("implausible_width");
  });

  it("never lets the marked area exceed the room", () => {
    const result = validateRoomGeometry({
      roomWidthM: 3,
      roomDepthM: 3,
      roomHeightM: 2.4,
      usableWidthM: 5,
      usableDepthM: 5,
      basis: "photo-room",
      confidence: 0.9,
    });
    expect(result.geometry.usableWidthM).toBe(3);
    expect(result.issues.map((issue) => issue.code)).toContain("usable_exceeds_room");
  });

  it("accepts a plausible confirmed room without confirmation", () => {
    const result = validateRoomGeometry({
      roomWidthM: 3.4,
      roomDepthM: 2.8,
      roomHeightM: 2.4,
      basis: "manual",
      confidence: 1,
    });
    expect(result.needsConfirmation).toBe(false);
    expect(longestWallRun(result.geometry)).toBe(3.4);
  });
});

describe("Phase 6Q — wall-mounted items", () => {
  it("hangs a television on a room wall even when the marked storage strip is narrow", () => {
    const space = planningSpaceFrom(room, { usable: { x: 1.1, y: 1.4, w: 1.1, d: 1.4 } });
    const arrangement = arrangeItems({ space, items: [tv] });
    const placed = arrangement.entries.find((entry) => entry.itemId === "ITEM-tv");
    expect(placed).toBeDefined();
    expect(placed?.mounted).toBe(true);
    expect(placed?.baseHeightM).toBeGreaterThan(0);
    expect(arrangement.unplaced.some((entry) => entry.itemId === "ITEM-tv")).toBe(false);
  });

  it("reports a measured reason when no wall run is long enough", () => {
    const tiny: StorageSpace = { ...room, width: 0.8, depth: 0.8 };
    const space = planningSpaceFrom(tiny);
    const arrangement = arrangeItems({ space, items: [tv] });
    const unplaced = arrangement.unplaced.find((entry) => entry.itemId === "ITEM-tv");
    expect(unplaced).toBeDefined();
    expect(unplaced?.reason).toMatch(/wall run|Not safely placeable/i);
  });

  it("classifies a wall-mounted television away from floor objects", () => {
    expect(classify(tv)).toBe("WALL_MOUNTED");
  });
});

describe("Phase 6Q — deterministic optimisation", () => {
  const inventory: PlanningItem[] = [
    item({ id: "ITEM-sofa", label: "Sofa", widthCm: 180, depthCm: 85, heightCm: 80, stackable: false, maxStack: 1 }),
    item({ id: "ITEM-wardrobe", label: "Wardrobe", widthCm: 100, depthCm: 60, heightCm: 190, stackable: false, maxStack: 1 }),
    item({ id: "ITEM-box", label: "Boxes", widthCm: 45, depthCm: 35, heightCm: 35, quantity: 6 }),
    item({ id: "ITEM-scissors", label: "Scissors", widthCm: 20, depthCm: 8, heightCm: 3 }),
    item({ id: "ITEM-bottle", label: "Bottle", widthCm: 10, depthCm: 10, heightCm: 28 }),
    item({ id: "ITEM-lamp", label: "Lamp", widthCm: 25, depthCm: 25, heightCm: 45 }),
    tv,
  ];

  const space = planningSpaceFrom(room);

  it("is fully deterministic across repeated runs", () => {
    const a = arrangeItems({ space, items: inventory });
    const b = arrangeItems({ space, items: inventory });
    expect(JSON.stringify(a.entries)).toBe(JSON.stringify(b.entries));
  });

  it("produces a physically valid arrangement", () => {
    const arrangement = arrangeItems({ space, items: inventory });
    expect(arrangement.valid).toBe(true);
    expect(arrangement.violations).toHaveLength(0);
  });

  it("consolidates small items instead of scattering them", () => {
    const arrangement = arrangeItems({ space, items: inventory });
    const smalls = arrangement.entries.filter((entry) =>
      ["ITEM-scissors", "ITEM-bottle", "ITEM-lamp"].includes(entry.itemId),
    );
    expect(smalls.length).toBeGreaterThan(0);
    // Every small item sits within a metre of another small item — no lone
    // object marooned in the middle of the floor.
    for (const entry of smalls) {
      const nearest = Math.min(
        ...arrangement.entries
          .filter((other) => other.key !== entry.key)
          .map((other) => Math.hypot(other.x - entry.x, other.y - entry.y)),
      );
      expect(nearest).toBeLessThanOrEqual(1.2);
    }
  });

  it("keeps large objects against a wall", () => {
    const arrangement = arrangeItems({ space, items: inventory });
    const sofa = arrangement.entries.find((entry) => entry.itemId === "ITEM-sofa");
    expect(sofa).toBeDefined();
    const touchesWall =
      sofa!.x <= space.usable.x + 0.05 ||
      sofa!.y <= space.usable.y + 0.05 ||
      sofa!.x + sofa!.w >= space.usable.x + space.usable.w - 0.05 ||
      sofa!.y + sofa!.d >= space.usable.y + space.usable.d - 0.05;
    expect(touchesWall).toBe(true);
  });

  it("never overlaps two placed footprints", () => {
    const arrangement = arrangeItems({ space, items: inventory });
    const floor = arrangement.entries.filter((entry) => !entry.mounted && entry.layer === 1);
    for (let i = 0; i < floor.length; i += 1) {
      for (let j = i + 1; j < floor.length; j += 1) {
        const a = floor[i]!;
        const b = floor[j]!;
        const overlap =
          a.x + a.w > b.x + 0.001 &&
          b.x + b.w > a.x + 0.001 &&
          a.y + a.d > b.y + 0.001 &&
          b.y + b.d > a.y + 0.001;
        expect(overlap).toBe(false);
      }
    }
  });
});
