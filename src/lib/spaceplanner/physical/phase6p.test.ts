/**
 * Phase 6P — deterministic arrangement quality audit.
 *
 * A–O of the brief: the same canonical manifest always produces the same plan
 * and the same coordinates, nothing overlaps, nothing leaves the room, the
 * access corridor survives, wall-mounted objects are never floor-standing,
 * invalid placements are rejected rather than hidden, and no probabilistic
 * model is anywhere near a placement decision.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACCESS_DEFAULTS,
  arrangeItems,
  bestArrangement,
  intersects,
  matchesCanonicalFootprint,
  placementFlexibility,
  planningItemsFrom,
  planningSpaceFrom,
  validateArrangement,
  walkwayIsClear,
} from "@/lib/spaceplanner/physical";
import { buildPhotoPlan } from "@/lib/spaceplanner/photo/plan";
import { buildPlacementManifest, lockInventory } from "@/lib/spaceplanner/photo/manifest";
import type { DetectedObject } from "@/lib/vision/types";
import type { StorageSpace } from "@/lib/spaceplanner/types";

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
    category: "boxes",
    quantity: 1,
    width: 60,
    depth: 40,
    height: 40,
    weight: "medium",
    fragile: false,
    stackable: true,
    confidence: 0.8,
    photoIds: ["photo-1"],
    source: "ai",
    countBasis: "observed",
    evidence: "seen in photo",
    ...partial,
  } as DetectedObject;
}

const objects: DetectedObject[] = [
  object({ id: "ITEM-001", label: "Storage box", quantity: 6, width: 50, depth: 40, height: 35 }),
  object({
    id: "ITEM-002",
    label: "Large blue wheeled suitcase",
    quantity: 2,
    width: 78,
    depth: 32,
    height: 52,
    weight: "heavy",
    stackable: false,
  }),
  object({
    id: "ITEM-003",
    label: "Two-seat sofa",
    width: 160,
    depth: 85,
    height: 80,
    weight: "heavy",
    stackable: false,
  }),
  object({
    id: "ITEM-004",
    label: "Wall-mounted television",
    width: 110,
    depth: 8,
    height: 65,
    fragile: true,
    stackable: false,
  }),
];

const items = planningItemsFrom(objects);
const planning = planningSpaceFrom(space);
const source = { widthM: space.width, depthM: space.depth, heightM: space.height, basis: "photo" as const };

describe("A/B/M — determinism", () => {
  it("produces identical coordinates for the same canonical manifest", () => {
    const first = bestArrangement(planningItemsFrom(objects), planningSpaceFrom(space));
    const second = bestArrangement(planningItemsFrom(objects), planningSpaceFrom(space));
    expect(JSON.stringify(second.entries)).toBe(JSON.stringify(first.entries));
    expect(second.strategy).toBe(first.strategy);
  });

  it("produces the same plan hash for the same inventory", () => {
    const build = () => {
      const result = buildPhotoPlan(objects, source)!;
      return buildPlacementManifest(lockInventory(objects, 0), result).planHash;
    };
    expect(build()).toBe(build());
  });

  it("scores the same arrangement identically every time", () => {
    const a = bestArrangement(items, planning).score;
    const b = bestArrangement(planningItemsFrom(objects), planningSpaceFrom(space)).score;
    expect(b).toEqual(a);
  });
});

describe("C/D/E — hard physical constraints", () => {
  const plan = bestArrangement(items, planning);

  it("never overlaps two floor footprints", () => {
    const floor = plan.entries.filter((entry) => entry.layer === 0);
    for (let i = 0; i < floor.length; i += 1) {
      for (let j = i + 1; j < floor.length; j += 1) {
        expect(intersects(floor[i]!, floor[j]!)).toBe(false);
      }
    }
  });

  it("never crosses the room boundary", () => {
    for (const entry of plan.entries) {
      expect(entry.x).toBeGreaterThanOrEqual(planning.usable.x - 0.01);
      expect(entry.y).toBeGreaterThanOrEqual(planning.usable.y - 0.01);
      expect(entry.x + entry.w).toBeLessThanOrEqual(planning.usable.x + planning.usable.w + 0.01);
      expect(entry.y + entry.d).toBeLessThanOrEqual(planning.usable.y + planning.usable.d + 0.01);
    }
  });

  it("keeps a clear access route of at least the minimum clearance", () => {
    expect(walkwayIsClear(planning, plan.entries)).toBe(true);
    if (plan.walkway) {
      expect(Math.max(plan.walkway.w, plan.walkway.d)).toBeGreaterThanOrEqual(
        ACCESS_DEFAULTS.minWalkwayM - 0.001,
      );
      for (const entry of plan.entries.filter((e) => e.layer === 0)) {
        expect(intersects(entry, plan.walkway!)).toBe(false);
      }
    }
  });
});

describe("1–3 — least flexible, floor-dominant objects first", () => {
  it("ranks a heavy sofa as less flexible than a small stackable box", () => {
    const sofa = items.find((item) => item.id === "ITEM-003")!;
    const box = items.find((item) => item.id === "ITEM-001")!;
    expect(placementFlexibility(sofa)).toBeLessThan(placementFlexibility(box));
  });

  it("places the sofa and the suitcases before the boxes", () => {
    const plan = arrangeItems(items, planning);
    const order = plan.entries.filter((entry) => !entry.mounted).map((entry) => entry.itemId);
    const sofa = order.indexOf("ITEM-003");
    const box = order.indexOf("ITEM-001");
    expect(sofa).toBeGreaterThanOrEqual(0);
    expect(sofa).toBeLessThan(box);
  });
});

describe("I/J — dimensions come from the canonical record", () => {
  it("only ever draws an object at one of its own dimensions", () => {
    const plan = bestArrangement(items, planning);
    for (const entry of plan.entries) {
      const item = items.find((candidate) => candidate.id === entry.itemId)!;
      expect(matchesCanonicalFootprint(item, entry.w, entry.d)).toBe(true);
    }
  });

  it("rejects an entry drawn smaller than the object really is", () => {
    const plan = arrangeItems(items, planning);
    const entry = plan.entries.find((candidate) => candidate.layer === 0)!;
    const { violations } = validateArrangement({
      space: planning,
      items,
      entries: [{ ...entry, w: 0.11, d: 0.11 }],
      unplacedUnits: new Map(),
    });
    expect(violations.some((violation) => violation.code === "invalid_dimensions")).toBe(true);
  });

  it("refuses an item with no usable dimensions before the planner sees it", () => {
    const bad = planningItemsFrom([
      object({ id: "ITEM-BAD", label: "", quantity: 1 }),
      object({ id: "ITEM-ZERO", label: "Mystery", quantity: 0 }),
    ]);
    expect(bad).toHaveLength(0);
  });
});

describe("K — wall-mounted objects", () => {
  const plan = bestArrangement(items, planning);
  const tv = plan.entries.filter((entry) => entry.itemId === "ITEM-004");

  it("hangs the television instead of standing it on the floor", () => {
    expect(tv).toHaveLength(1);
    expect(tv[0]!.mounted).toBe(true);
    expect(tv[0]!.layer).toBeGreaterThan(0);
    expect(tv[0]!.baseHeightM).toBeGreaterThan(0);
  });

  it("rejects a wall-mounted object placed as floor-standing", () => {
    const { violations } = validateArrangement({
      space: planning,
      items,
      entries: [{ ...tv[0]!, mounted: false, layer: 0, baseHeightM: 0, supportedBy: null }],
      unplacedUnits: new Map(),
    });
    expect(violations.some((violation) => violation.code === "invalid_wall_mount")).toBe(true);
  });

  it("rejects a freestanding object pretending to hang on a wall", () => {
    const box = plan.entries.find((entry) => entry.itemId === "ITEM-001")!;
    const { violations } = validateArrangement({
      space: planning,
      items,
      entries: [{ ...box, mounted: true, layer: 1, baseHeightM: 1, supportedBy: "wall" }],
      unplacedUnits: new Map(),
    });
    expect(violations.some((violation) => violation.code === "invalid_wall_mount")).toBe(true);
  });
});

describe("L — invalid placements are rejected, never hidden", () => {
  it("flags a missing coordinate rather than drawing it", () => {
    const plan = arrangeItems(items, planning);
    const entry = plan.entries[0]!;
    const { violations, valid } = validateArrangement({
      space: planning,
      items,
      entries: [{ ...entry, x: Number.NaN }],
      unplacedUnits: new Map(),
    });
    expect(valid).toBe(false);
    expect(violations.some((violation) => violation.code === "missing_coordinates")).toBe(true);
  });

  it("flags a rotation the planner never produces", () => {
    const plan = arrangeItems(items, planning);
    const entry = plan.entries[0]!;
    const { violations } = validateArrangement({
      space: planning,
      items,
      entries: [{ ...entry, rotationDeg: 45 as unknown as 0 }],
      unplacedUnits: new Map(),
    });
    expect(violations.some((violation) => violation.code === "invalid_rotation")).toBe(true);
  });

  it("reports what cannot be placed instead of forcing it in", () => {
    const tiny = planningSpaceFrom({ ...space, width: 1.4, depth: 1.6, doorWidth: 1.2 });
    const plan = bestArrangement(items, tiny);
    const placedUnits = plan.entries.reduce((sum, entry) => sum + entry.units, 0);
    const unplacedUnits = plan.unplaced.reduce((sum, entry) => sum + entry.units, 0);
    expect(placedUnits + unplacedUnits).toBe(plan.expectedUnits);
    expect(walkwayIsClear(tiny, plan.entries)).toBe(true);
  });
});

describe("F/G/H — the renderer is fed the planner's own coordinates", () => {
  const result = buildPhotoPlan(objects, source)!;
  const manifest = buildPlacementManifest(lockInventory(objects, 0), result);

  it("copies planner coordinates into the manifest unchanged", () => {
    for (const entry of manifest.entries) {
      const planned = result.arrangement.entries.filter((candidate) => candidate.itemId === entry.id);
      expect(entry.positions).toHaveLength(planned.length);
      planned.forEach((candidate, index) => {
        const position = entry.positions[index]!;
        expect(position.xM).toBeCloseTo(candidate.x, 2);
        expect(position.yM).toBeCloseTo(candidate.y, 2);
        expect(position.widthM).toBeCloseTo(candidate.w, 2);
        expect(position.depthM).toBeCloseTo(candidate.d, 2);
        expect(position.heightM).toBeCloseTo(candidate.heightM, 2);
        expect(position.mounted).toBe(candidate.mounted);
      });
    }
  });

  it("never gives an unplaced object a position", () => {
    for (const entry of manifest.entries) {
      if (entry.state === "cannot be safely placed") expect(entry.positions).toHaveLength(0);
    }
  });

  it("draws the manifest geometry directly, without adjusting it", () => {
    const source = readFileSync(
      "src/components/spaceplanner/photo/ArrangementPlanDiagram.tsx",
      "utf8",
    );
    expect(source).toContain("x={unit.xM}");
    expect(source).toContain("width={unit.widthM}");
    expect(source).not.toMatch(/unit\.(xM|yM|widthM|depthM)\s*[*+-]/);
  });
});

describe("N — item identity survives an inventory edit", () => {
  it("leaves unrelated ids and dimensions untouched when one item is removed", () => {
    const full = bestArrangement(items, planning);
    const without = bestArrangement(
      planningItemsFrom(objects.filter((entry) => entry.id !== "ITEM-001")),
      planning,
    );
    const dims = (plan: typeof full, id: string) => {
      const entry = plan.entries.find((candidate) => candidate.itemId === id);
      return entry ? `${entry.w}x${entry.d}` : null;
    };
    expect(dims(without, "ITEM-003")).toBe(dims(full, "ITEM-003"));
    expect(without.entries.every((entry) => entry.itemId !== "ITEM-001")).toBe(true);
  });
});

describe("O — no probabilistic model decides placement", () => {
  it("keeps the planner free of AI, gateway and randomness", () => {
    for (const file of ["arrange", "items", "space", "constraints", "score", "quality"]) {
      const contents = readFileSync(`src/lib/spaceplanner/physical/${file}.ts`, "utf8");
      expect(contents).not.toMatch(/gemini|openai|gateway|Math\.random|fetch\(/i);
    }
  });
});
