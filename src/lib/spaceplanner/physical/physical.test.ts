/**
 * Phase 6E — physical placement engine regression tests.
 *
 * These lock the rules the product brief calls non-negotiable: nothing is
 * invented, access stays clear, orientation is respected, and a plan that
 * cannot be validated is never reported as successful.
 */
import { describe, expect, it } from "vitest";

import {
  ACCESS_DEFAULTS,
  accessGeometry,
  arrangeItems,
  bestArrangement,
  intersects,
  planningItemsFrom,
  planningSpaceFrom,
  scatteredCount,
  usableRectFromSelection,
  validateArrangement,
  walkwayIsClear,
} from "@/lib/spaceplanner/physical";
import type { StorageSpace } from "@/lib/spaceplanner/types";
import type { DetectedObject } from "@/lib/vision/types";

const space: StorageSpace = {
  id: "single-garage",
  name: "Single garage",
  width: 3,
  depth: 5.5,
  height: 2.4,
  door: "front",
  doorWidth: 2.3,
  kind: "garage",
  blurb: "Test space",
};

function object(partial: Partial<DetectedObject> & { id: string; label: string }): DetectedObject {
  return {
    catalogueId: null,
    quantity: 1,
    width: 60,
    depth: 40,
    height: 40,
    weight: "medium",
    fragile: false,
    confidence: 0.8,
    photoIds: ["photo-1"],
    countBasis: "observed",
    evidence: "seen in photo",
    ...partial,
  } as DetectedObject;
}

const boxes = planningItemsFrom([
  object({ id: "ITEM-001", label: "Storage box", quantity: 6, width: 50, depth: 40, height: 35 }),
  object({ id: "ITEM-002", label: "Wardrobe", width: 120, depth: 60, height: 200, weight: "heavy" }),
  object({ id: "ITEM-003", label: "Television", width: 110, depth: 12, height: 65, fragile: true }),
]);

describe("physical placement engine", () => {
  it("never invents an item and accounts for every confirmed unit", () => {
    const plan = arrangeItems(boxes, planningSpaceFrom(space));
    const known = new Set(boxes.map((item) => item.id));
    for (const entry of plan.entries) expect(known.has(entry.itemId)).toBe(true);
    expect(plan.placedUnits + plan.unplaced.reduce((sum, e) => sum + e.units, 0)).toBe(
      plan.expectedUnits,
    );
  });

  it("keeps the access route and the opening clear", () => {
    const planning = planningSpaceFrom(space);
    const plan = arrangeItems(boxes, planning);
    expect(walkwayIsClear(planning, plan.entries)).toBe(true);
    const geometry = accessGeometry(planning);
    if (geometry.walkway) {
      for (const entry of plan.entries.filter((e) => e.layer === 0)) {
        expect(intersects(entry, geometry.walkway)).toBe(false);
      }
    }
  });

  it("produces no overlapping footprints", () => {
    const plan = arrangeItems(boxes, planningSpaceFrom(space));
    const floor = plan.entries.filter((entry) => entry.layer === 0);
    for (let i = 0; i < floor.length; i += 1)
      for (let j = i + 1; j < floor.length; j += 1)
        expect(intersects(floor[i]!, floor[j]!)).toBe(false);
  });

  it("reports a validated plan, with violations when one exists", () => {
    const planning = planningSpaceFrom(space);
    const plan = arrangeItems(boxes, planning);
    expect(plan.valid).toBe(true);
    expect(plan.violations).toEqual([]);
  });

  it("refuses to place an item that cannot physically fit", () => {
    const huge = planningItemsFrom([
      object({ id: "ITEM-BIG", label: "Shipping crate", width: 600, depth: 600, height: 300 }),
    ]);
    const plan = arrangeItems(huge, planningSpaceFrom(space));
    expect(plan.entries).toHaveLength(0);
    expect(plan.unplaced[0]?.itemId).toBe("ITEM-BIG");
    expect(plan.score.completeness).toBe(0);
  });

  it("does not scatter items across open floor", () => {
    const planning = planningSpaceFrom(space);
    const plan = arrangeItems(boxes, planning);
    expect(scatteredCount(planning, plan.entries)).toBe(0);
    expect(plan.score.wallUse).toBeGreaterThan(50);
  });

  it("respects the user's usable-area selection", () => {
    const usable = usableRectFromSelection(
      { widthM: space.width, depthM: space.depth },
      { x: 0, y: 0, width: 0.5, height: 0.5 },
    );
    const planning = planningSpaceFrom(space, { usable });
    const plan = arrangeItems(boxes, planning);
    for (const entry of plan.entries) {
      expect(entry.x).toBeGreaterThanOrEqual(usable.x - 0.01);
      expect(entry.x + entry.w).toBeLessThanOrEqual(usable.x + usable.w + 0.01);
    }
  });

  it("keeps fixed furniture unobstructed", () => {
    const obstacle = { id: "obs-1", x: 0, y: 0, w: 1, d: 1, kind: "fixed_furniture" as const, label: "Boiler" };
    const planning = planningSpaceFrom(space, { obstacles: [obstacle] });
    const plan = arrangeItems(boxes, planning);
    for (const entry of plan.entries.filter((e) => e.layer === 0)) {
      expect(intersects(entry, obstacle)).toBe(false);
    }
  });

  it("never stands anything higher than the safe stacking limit", () => {
    const many = planningItemsFrom([
      object({ id: "ITEM-STACK", label: "Box", quantity: 12, width: 40, depth: 40, height: 40 }),
    ]);
    const plan = arrangeItems(many, planningSpaceFrom(space));
    for (const entry of plan.entries) {
      expect(entry.baseHeightM + entry.heightM).toBeLessThanOrEqual(
        Math.min(space.height, ACCESS_DEFAULTS.maxStackHeightM) + 0.001,
      );
    }
  });

  it("detects an invalid arrangement rather than reporting a false success", () => {
    const planning = planningSpaceFrom(space);
    const result = validateArrangement({
      space: planning,
      items: boxes,
      entries: [
        {
          key: "bad",
          itemId: "GHOST",
          label: "Ghost sofa",
          units: 1,
          x: 0,
          y: 0,
          w: 1,
          d: 1,
          heightM: 1,
          baseHeightM: 0,
          layer: 0,
          rotationDeg: 0,
          orientation: "flat",
          zone: "interior",
          supportsItemIds: [],
          supportedBy: null,
          groupId: "GHOST",
          fragile: false,
          weight: "medium",
          confidence: 0.5,
          mounted: false,
        },
      ],
      unplacedUnits: new Map(),
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "invented_item")).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = bestArrangement(boxes, planningSpaceFrom(space));
    const b = bestArrangement(boxes, planningSpaceFrom(space));
    expect(JSON.stringify(a.entries)).toEqual(JSON.stringify(b.entries));
  });
});

/**
 * Phase 6H — true physical arrangement.
 *
 * The failing real-world case was a garage where a handful of belongings ended
 * up spread around the perimeter in three separate groups. The engine must now
 * consolidate them into one contiguous block against the walls, with the
 * corridor still clear.
 */
describe("phase 6H — consolidated arrangement", () => {
  const household = planningItemsFrom([
    object({ id: "ITEM-001", label: "Storage box", category: "boxes", quantity: 5, width: 50, depth: 40, height: 35 }),
    object({ id: "ITEM-002", label: "Suitcase", category: "leisure", quantity: 2, width: 70, depth: 30, height: 50 }),
    object({ id: "ITEM-003", label: "Rucksack", category: "leisure", width: 35, depth: 25, height: 50, weight: "light" }),
    object({ id: "ITEM-004", label: "Armchair", category: "furniture", width: 90, depth: 85, height: 100, weight: "heavy" }),
  ]);

  const planned = planningSpaceFrom(space);
  const plan = bestArrangement(household, planned);

  it("places every unit", () => {
    expect(plan.unplaced).toHaveLength(0);
    expect(plan.placedUnits).toBe(plan.expectedUnits);
  });

  it("keeps the access corridor clear", () => {
    expect(walkwayIsClear(plan.space, plan.entries)).toBe(true);
  });

  it("forms one or two blocks rather than scattering", () => {
    expect(plan.quality.antiScatter.clusters).toBeLessThanOrEqual(2);
    expect(scatteredCount(plan.space, plan.entries)).toBe(0);
  });

  it("clears the arrangement-quality gate", () => {
    expect(plan.quality.passes).toBe(true);
  });

  it("reports which side the corridor ran", () => {
    expect(["centre", "left", "right"]).toContain(plan.corridorSide);
  });

  it("stays deterministic across runs", () => {
    const again = bestArrangement(household, planned);
    expect(again.entries.map((entry) => `${entry.itemId}@${entry.x},${entry.y}`)).toEqual(
      plan.entries.map((entry) => `${entry.itemId}@${entry.x},${entry.y}`),
    );
    expect(again.corridorSide).toBe(plan.corridorSide);
  });

  it("puts a side corridor hard against its wall", () => {
    const geometry = accessGeometry({ ...planned, corridorSide: "left" });
    expect(geometry.walkway?.x).toBeCloseTo(planned.usable.x, 2);
  });
});
