import { describe, expect, it } from "vitest";

import { buildMatchInventory, evaluateSpace, runMatching } from "./engine";
import { SPACEFIT_TOTAL } from "./config";
import type { MatchSpace } from "./types";
import type { InventoryItem } from "@/lib/inventory-model";

function item(partial: Partial<InventoryItem> & { item_name: string; category: InventoryItem["category"] }) {
  return {
    id: partial.item_name,
    quantity: 1,
    length_cm: 50,
    width_cm: 40,
    height_cm: 40,
    ...partial,
  } as unknown as InventoryItem;
}

const boxes = item({ item_name: "Cardboard box", category: "boxes", quantity: 10 });
const bicycle = item({
  item_name: "Adult bicycle",
  category: "bicycles",
  length_cm: 180,
  width_cm: 65,
  height_cm: 110,
});

function space(partial: Partial<MatchSpace> = {}): MatchSpace {
  return {
    id: "space-1",
    title: "Dry lock-up garage",
    space_type: "garage",
    postcode_district: "PO1",
    approximate_area: "Portsmouth",
    monthly_price_pence: 5500,
    estimated_available_volume_m3: 18,
    total_volume_m3: 18,
    accepted_categories: ["boxes", "bicycles", "suitcases", "household"],
    host_restrictions: [],
    restriction_notes: null,
    features: ["indoor", "dry", "lockable"],
    access_type: "by_arrangement",
    moisture_condition: "dry",
    temperature_condition: "normal_indoor",
    door_width_cm: null,
    door_height_cm: null,
    photo_count: 3,
    cover_path: null,
    ...partial,
  };
}

describe("spacefit engine", () => {
  it("hard-fails when capacity is below the estimated requirement", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const result = evaluateSpace(space({ estimated_available_volume_m3: 0.5 }), inventory);
    expect(result.compatible).toBe(false);
    expect(result.score).toBeNull();
    expect(result.hard_failures.map((f) => f.rule)).toContain("capacity");
  });

  it("hard-fails when the host does not accept a renter category", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const result = evaluateSpace(space({ accepted_categories: ["boxes", "suitcases", "household"] }), inventory);
    expect(result.compatible).toBe(false);
    expect(result.hard_failures[0]?.message).toContain("bicycles");
  });

  it("is compatible with a reduced entrance score when entrance data is unknown", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const result = evaluateSpace(space(), inventory);
    expect(result.compatible).toBe(true);
    expect(result.components?.geometry.state).toBe("unknown");
    expect(result.components?.geometry.score).toBe(6);
    expect(result.warnings).toContain("Entrance size hasn't been provided");
    expect(result.score).toBeLessThan(100);
  });

  it("hard-fails when a known entrance cannot take an item", () => {
    const inventory = buildMatchInventory([bicycle]);
    const result = evaluateSpace(space({ door_width_cm: 60, door_height_cm: 60 }), inventory);
    expect(result.compatible).toBe(false);
    expect(result.hard_failures.map((f) => f.rule)).toContain("entrance");
  });

  it("passes the entrance check when dimensions are generous", () => {
    const inventory = buildMatchInventory([bicycle]);
    const result = evaluateSpace(space({ door_width_cm: 240, door_height_cm: 210 }), inventory);
    expect(result.components?.geometry.state).toBe("pass");
    expect(result.components?.geometry.score).toBe(10);
  });

  it("produces identical scores for identical inputs", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const a = evaluateSpace(space(), inventory);
    const b = evaluateSpace(space(), inventory);
    expect(a.score).toBe(b.score);
    expect(a.positives).toEqual(b.positives);
  });

  it("component scores sum exactly to the total and never exceed the maximum", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const result = evaluateSpace(space({ door_width_cm: 240, door_height_cm: 210 }), inventory);
    const components = Object.values(result.components!);
    const sum = components.reduce((total, c) => total + c.score, 0);
    expect(sum).toBe(result.score);
    expect(sum).toBeLessThanOrEqual(SPACEFIT_TOTAL);
    components.forEach((c) => expect(c.score).toBeLessThanOrEqual(c.max));
  });

  it("ranks compatible spaces by score, then data completeness, then price", () => {
    const inventory = buildMatchInventory([boxes]);
    const rich = space({ id: "rich", door_width_cm: 240, door_height_cm: 210 });
    const sparse = space({ id: "sparse", features: [], access_type: null, photo_count: 0 });
    const failing = space({ id: "failing", estimated_available_volume_m3: 0.1 });
    const run = runMatching([sparse, failing, rich], inventory);
    expect(run.compatible.map((entry) => entry.space.id)).toEqual(["rich", "sparse"]);
    expect(run.incompatible.map((entry) => entry.space.id)).toEqual(["failing"]);
    expect(run.incompatible[0]?.result.score).toBeNull();
  });

  it("applies an uncertainty deduction, not a failure, for unspecified categories", () => {
    const inventory = buildMatchInventory([boxes, bicycle]);
    const result = evaluateSpace(space({ accepted_categories: [] }), inventory);
    expect(result.compatible).toBe(true);
    expect(result.components!.itemCompatibility.score).toBeLessThan(25);
    expect(result.components!.itemCompatibility.state).toBe("unknown");
  });

  it("hard-fails on an explicit host restriction that matches the inventory", () => {
    const inventory = buildMatchInventory([
      item({ item_name: "Three-seat sofa", category: "furniture", length_cm: 210, width_cm: 90, height_cm: 85 }),
    ]);
    const result = evaluateSpace(
      space({ accepted_categories: ["furniture"], host_restrictions: ["no_large_furniture"] }),
      inventory,
    );
    expect(result.compatible).toBe(false);
    expect(result.hard_failures.map((f) => f.rule)).toContain("host_restriction");
  });

  it("only reflects the items it is given, so unconfirmed detections cannot affect a score", () => {
    const confirmed = buildMatchInventory([boxes]);
    const withPending = buildMatchInventory([boxes, bicycle]);
    expect(evaluateSpace(space(), confirmed).score).not.toBe(undefined);
    expect(confirmed.categories).toEqual(["boxes"]);
    expect(withPending.categories).not.toEqual(confirmed.categories);
  });
});
