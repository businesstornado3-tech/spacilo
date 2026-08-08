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
  doorWidth: 2.3,
  monthlyPrice: 90,
  description: "Test space",
  icon: "garage",
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
    const obstacle = { x: 0, y: 0, w: 1, d: 1, kind: "fixed_furniture" as const, label: "Boiler" };
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
          zone: "floor_open",
          supportsItemIds: [],
          supportedBy: null,
          groupId: "GHOST",
          fragile: false,
          weight: "medium",
          confidence: 0.5,
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
