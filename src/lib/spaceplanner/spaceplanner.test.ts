/**
 * SpacePlanner™ engine contract.
 *
 * The public demo makes claims on screen ("stacked four high", "walkway
 * preserved", "1.2m³ free"). These tests hold the engine to them, and hold it
 * to being deterministic — the same inputs must always produce the same plan.
 */
import { describe, expect, it } from "vitest";

import {
  buildPlan,
  CATALOGUE_ITEMS,
  CATALOGUE_BY_ID,
  DEMO_SPACES,
  INVENTORY_PRESETS,
  itemVolume,
  PACKING_ALLOWANCE,
  searchCatalogue,
  simulationEngine,
  SPACE_BY_ID,
  THINKING_STAGES,
  totalItemVolume,
  usableVolume,
  walkwayDepth,
  type InventoryLine,
} from "@/lib/spaceplanner";

const item = (id: string) => {
  const found = CATALOGUE_BY_ID.get(id);
  if (!found) throw new Error(`missing catalogue item: ${id}`);
  return found;
};

const lines = (spec: Record<string, number>): InventoryLine[] =>
  Object.entries(spec).map(([id, quantity]) => ({ item: item(id), quantity }));

const garage = SPACE_BY_ID.get("garage")!;

describe("catalogue", () => {
  it("covers every item type the homepage advertises", () => {
    for (const id of [
      "medium-box",
      "bicycle",
      "television",
      "wardrobe",
      "mattress",
      "dining-table",
      "suitcase",
      "book-crate",
      "desk",
      "dining-chair",
      "sports-kit",
      "guitar",
      "christmas",
      "appliance",
    ]) {
      expect(CATALOGUE_BY_ID.has(id), id).toBe(true);
    }
  });

  it("gives every item real dimensions, a weight class and handling flags", () => {
    for (const entry of CATALOGUE_ITEMS) {
      expect(entry.width).toBeGreaterThan(0);
      expect(entry.depth).toBeGreaterThan(0);
      expect(entry.height).toBeGreaterThan(0);
      expect(["light", "medium", "heavy"]).toContain(entry.weight);
      expect(entry.maxStack).toBeGreaterThanOrEqual(1);
      if (!entry.stackable) expect(entry.maxStack).toBe(1);
      expect(itemVolume(entry)).toBeGreaterThan(0);
    }
  });

  it("searches by name and by category", () => {
    expect(searchCatalogue("bike").map((i) => i.id)).toEqual([]);
    expect(searchCatalogue("bicycle").map((i) => i.id)).toEqual(["bicycle"]);
    expect(searchCatalogue("furniture").length).toBeGreaterThan(3);
    expect(searchCatalogue("  ").length).toBe(CATALOGUE_ITEMS.length);
  });

  it("ships presets that only reference real catalogue items", () => {
    expect(INVENTORY_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of INVENTORY_PRESETS) {
      for (const line of preset.lines) {
        expect(CATALOGUE_BY_ID.has(line.itemId), line.itemId).toBe(true);
        expect(line.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe("spaces", () => {
  it("offers the nine advertised space types with usable dimensions", () => {
    expect(DEMO_SPACES).toHaveLength(9);
    for (const space of DEMO_SPACES) {
      expect(space.width).toBeGreaterThan(0);
      expect(space.depth).toBeGreaterThan(0);
      expect(space.height).toBeGreaterThan(0);
      expect(space.doorWidth).toBeGreaterThan(0);
      expect(space.doorWidth).toBeLessThanOrEqual(space.width + 0.001);
      expect(usableVolume(space)).toBeLessThan(space.width * space.depth * space.height);
    }
  });
});

describe("volume maths", () => {
  it("adds up item volumes by quantity", () => {
    const box = item("medium-box");
    const plan = lines({ "medium-box": 4 });
    expect(totalItemVolume(plan)).toBeCloseTo(itemVolume(box) * 4, 3);
  });

  it("applies a packing allowance rather than claiming a perfect fit", () => {
    const plan = buildPlan(lines({ "medium-box": 6 }), garage);
    expect(plan.metrics.requiredVolume).toBeGreaterThan(plan.metrics.itemVolume);
    expect(plan.metrics.requiredVolume).toBeCloseTo(
      plan.metrics.itemVolume * PACKING_ALLOWANCE,
      2,
    );
  });

  it("never reports negative remaining capacity", () => {
    const plan = buildPlan(lines({ "large-box": 60 }), SPACE_BY_ID.get("loft")!);
    expect(plan.metrics.remainingCapacity).toBeGreaterThanOrEqual(0);
  });
});

describe("optimised packing", () => {
  const plan = buildPlan(
    lines({
      "medium-box": 8,
      bicycle: 1,
      television: 1,
      mattress: 1,
      suitcase: 2,
      "book-crate": 3,
    }),
    garage,
  );

  it("keeps a clear walkway inside the door", () => {
    expect(plan.after.walkway).not.toBeNull();
    expect(plan.after.walkway!.d).toBe(walkwayDepth(garage));
    expect(plan.metrics.walkwayPreserved).toBe(true);
  });

  it("never places anything inside the walkway strip", () => {
    const limit = garage.depth - walkwayDepth(garage);
    for (const p of plan.after.placements) {
      expect(p.y + p.d).toBeLessThanOrEqual(limit + 0.001);
    }
  });

  it("keeps every placement inside the space footprint", () => {
    for (const p of plan.after.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(garage.width + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("stands tall flat items upright to reclaim floor area", () => {
    const mattress = plan.after.placements.find((p) => p.itemId === "mattress");
    expect(mattress?.upright).toBe(true);
    expect(mattress!.w * mattress!.d).toBeLessThan(1.9 * 1.35);
  });

  it("stacks stackable boxes instead of spreading them across the floor", () => {
    const boxes = plan.after.placements.filter((p) => p.itemId === "medium-box");
    expect(boxes.some((p) => p.units > 1)).toBe(true);
    expect(plan.after.stackedUnits).toBeGreaterThan(0);
    expect(plan.metrics.stackingEfficiency).toBeGreaterThan(0);
  });

  it("keeps heavy items on the floor", () => {
    for (const p of plan.after.placements.filter((p) => p.weight === "heavy")) {
      expect(p.level).toBe(0);
    }
    expect(plan.metrics.heavyItemsLow).toBe(true);
  });

  it("never buries a fragile item under a stack", () => {
    for (const p of plan.after.placements.filter((p) => p.fragile)) {
      expect(p.units).toBe(1);
    }
  });

  it("puts everyday items where they can be reached", () => {
    const suitcases = plan.after.placements.filter((p) => p.itemId === "suitcase");
    expect(suitcases.length).toBeGreaterThan(0);
    expect(suitcases.every((p) => p.zone !== "back")).toBe(true);
    expect(plan.metrics.retrieval).toBeGreaterThan(50);
  });

  it("uses less floor than loading items in the order they arrive", () => {
    expect(plan.after.floorAreaUsed).toBeLessThan(plan.before.floorAreaUsed);
  });

  it("leaves the naive pass unoptimised so the comparison is honest", () => {
    expect(plan.before.walkway).toBeNull();
    expect(plan.before.stackedUnits).toBe(0);
    expect(plan.before.placements.every((p) => p.level === 0)).toBe(true);
    expect(plan.before.placements.every((p) => !p.upright)).toBe(true);
  });
});

describe("metrics", () => {
  it("bounds every score to 0–100", () => {
    for (const space of DEMO_SPACES) {
      const plan = buildPlan(lines({ "large-box": 12, wardrobe: 1, bicycle: 1 }), space);
      for (const score of [
        plan.metrics.utilisation,
        plan.metrics.utilisationBefore,
        plan.metrics.compatibility,
        plan.metrics.retrieval,
        plan.metrics.accessibility,
        plan.metrics.stackingEfficiency,
      ]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("marks an overloaded space as a poor fit rather than forcing it", () => {
    const plan = buildPlan(lines({ wardrobe: 6, "dining-table": 4 }), SPACE_BY_ID.get("shed")!);
    expect(plan.metrics.everythingFits).toBe(false);
    expect(plan.after.unplaced.length).toBeGreaterThan(0);
    expect(plan.metrics.compatibility).toBeLessThan(70);
  });

  it("rates a comfortable fit highly", () => {
    const plan = buildPlan(lines({ "medium-box": 6, suitcase: 2 }), garage);
    expect(plan.metrics.everythingFits).toBe(true);
    expect(plan.metrics.compatibility).toBeGreaterThanOrEqual(80);
  });
});

describe("explanations", () => {
  it("explains the plan in plain English with no jargon or fake certainty", () => {
    const plan = buildPlan(lines({ "medium-box": 8, bicycle: 1, television: 1 }), garage);
    expect(plan.explanations.length).toBeGreaterThan(3);
    const text = plan.explanations.join(" ");
    expect(text).not.toMatch(/guaranteed|insured|perfect fit|100% safe|zero risk/i);
    expect(text).not.toMatch(/heuristic|algorithm|bin.?pack|vector|tensor/i);
    for (const sentence of plan.explanations) {
      expect(sentence.trim().length).toBeGreaterThan(20);
      expect(sentence.trim().endsWith(".")).toBe(true);
    }
  });

  it("says so when items will not fit", () => {
    const plan = buildPlan(lines({ wardrobe: 8 }), SPACE_BY_ID.get("shed")!);
    expect(plan.explanations.join(" ")).toMatch(/would not fit/i);
  });

  it("invites the visitor in when the inventory is empty", () => {
    const plan = buildPlan([], garage);
    expect(plan.itemCount).toBe(0);
    expect(plan.explanations).toHaveLength(1);
  });
});

describe("determinism", () => {
  it("returns an identical plan for identical inputs", () => {
    const spec = { "medium-box": 5, bicycle: 1, mattress: 1, christmas: 2 };
    const a = buildPlan(lines(spec), garage);
    const b = buildPlan(lines(spec), garage);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("ignores zero-quantity lines", () => {
    const withZero = buildPlan(lines({ "medium-box": 4, wardrobe: 0 }), garage);
    const without = buildPlan(lines({ "medium-box": 4 }), garage);
    expect(JSON.stringify(withZero)).toBe(JSON.stringify(without));
  });

  it("exposes the simulation through the swappable engine interface", () => {
    expect(simulationEngine.id).toBe("spaceplanner-simulation-v1");
    const viaEngine = simulationEngine.plan(lines({ "medium-box": 3 }), garage);
    expect(JSON.stringify(viaEngine)).toBe(JSON.stringify(buildPlan(lines({ "medium-box": 3 }), garage)));
  });
});

describe("thinking stages", () => {
  it("narrates the pipeline rather than faking a spinner", () => {
    expect(THINKING_STAGES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(THINKING_STAGES.map((s) => s.id)).size).toBe(THINKING_STAGES.length);
    for (const stage of THINKING_STAGES) {
      expect(stage.duration).toBeGreaterThan(0);
      expect(stage.label).not.toMatch(/loading|please wait/i);
    }
  });
});
