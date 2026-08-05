/**
 * Requirement engine — the number every SpaceFit surface is built on.
 * These tests pin the assumptions so the estimate can never drift silently.
 */
import { describe, expect, it } from "vitest";

import { estimateRequiredSpace, REQUIREMENT_CONFIDENCE_LABEL } from "./requirement";
import type { InventoryItem } from "@/lib/inventory-model";

function item(partial: Partial<InventoryItem> & { item_name: string; category: InventoryItem["category"] }) {
  return {
    id: partial.item_name,
    quantity: 1,
    length_cm: 50,
    width_cm: 40,
    height_cm: 40,
    fragile: false,
    stackable: "yes",
    size_source: "user_measured",
    ...partial,
  } as unknown as InventoryItem;
}

const box = item({ item_name: "Cardboard box", category: "boxes", quantity: 10 });
const sofa = item({
  item_name: "Two-seat sofa",
  category: "furniture",
  length_cm: 160,
  width_cm: 85,
  height_cm: 85,
  stackable: "no",
});

describe("estimateRequiredSpace", () => {
  it("returns a zeroed, warned estimate for an empty inventory", () => {
    const r = estimateRequiredSpace([]);
    expect(r.itemCount).toBe(0);
    expect(r.requiredVolumeM3).toBe(0);
    expect(r.requiredFloorAreaM2).toBe(0);
    expect(r.requiredHeightM).toBeNull();
    expect(r.warnings.join(" ")).toContain("Add some belongings");
  });

  it("stamps the algorithm version onto every estimate", () => {
    expect(estimateRequiredSpace([box]).algorithm).toBe("spacefit-requirement-v1");
  });

  it("produces a positive volume and floor area for measured items", () => {
    const r = estimateRequiredSpace([box]);
    expect(r.requiredVolumeM3).toBeGreaterThan(0);
    expect(r.requiredFloorAreaM2).toBeGreaterThan(0);
  });

  it("is deterministic for the same inventory", () => {
    expect(estimateRequiredSpace([box, sofa])).toEqual(estimateRequiredSpace([box, sofa]));
  });

  it("is order-independent", () => {
    expect(estimateRequiredSpace([box, sofa]).requiredVolumeM3).toBeCloseTo(
      estimateRequiredSpace([sofa, box]).requiredVolumeM3,
      6,
    );
  });

  it("grows the requirement as quantity grows", () => {
    const small = estimateRequiredSpace([item({ item_name: "Box", category: "boxes", quantity: 2 })]);
    const large = estimateRequiredSpace([item({ item_name: "Box", category: "boxes", quantity: 20 })]);
    expect(large.requiredVolumeM3).toBeGreaterThan(small.requiredVolumeM3);
    expect(large.requiredFloorAreaM2).toBeGreaterThan(small.requiredFloorAreaM2);
  });

  it("never stacks fragile items, so they need more floor space", () => {
    const plain = estimateRequiredSpace([item({ item_name: "Crate", category: "boxes", quantity: 6 })]);
    const fragile = estimateRequiredSpace([
      item({ item_name: "Crate", category: "boxes", quantity: 6, fragile: true }),
    ]);
    expect(fragile.requiredFloorAreaM2).toBeGreaterThan(plain.requiredFloorAreaM2);
    expect(fragile.fragileCount).toBe(6);
    expect(fragile.warnings.join(" ")).toContain("Fragile");
  });

  it("gives non-stackable items their own floor patch and warns", () => {
    const r = estimateRequiredSpace([
      item({ item_name: "Cabinet", category: "furniture", quantity: 3, stackable: "no" }),
    ]);
    expect(r.nonStackableCount).toBe(3);
    expect(r.warnings.join(" ")).toContain("can't be stacked");
  });

  it("counts unmeasured lines and warns the estimate is probably low", () => {
    const r = estimateRequiredSpace([
      item({ item_name: "Mystery bag", category: "bags", length_cm: null, width_cm: null, height_cm: null }),
    ]);
    expect(r.unknownSizeLines).toBeGreaterThan(0);
    expect(r.warnings.join(" ")).toContain("no measurements");
  });

  it("reports the largest item and a door clearance from its smallest dimension", () => {
    const r = estimateRequiredSpace([box, sofa]);
    expect(r.largestItemLabel).toBe("Two-seat sofa");
    expect(r.requiredDoorClearanceCm).toBe(85);
  });

  it("adds an aisle allowance on top of the raw footprint", () => {
    // 1 box, 50×40×40 resting on its smallest face → 0.2 m² raw.
    const r = estimateRequiredSpace([item({ item_name: "Box", category: "boxes", quantity: 1 })]);
    expect(r.requiredFloorAreaM2).toBeGreaterThan(0.2);
  });

  it("rates fully measured, user-measured inventories as high confidence", () => {
    expect(estimateRequiredSpace([box, sofa]).confidence).toBe("high");
  });

  it("drops confidence when sizes are catalogue estimates", () => {
    const r = estimateRequiredSpace([
      item({ item_name: "Box", category: "boxes", size_source: "catalogue_estimate" }),
      item({ item_name: "Bag", category: "bags", size_source: "catalogue_estimate" }),
    ]);
    expect(r.confidence).not.toBe("high");
  });

  it("drops to low confidence when most items are unmeasured", () => {
    const r = estimateRequiredSpace([
      item({ item_name: "A", category: "other", length_cm: null, width_cm: null, height_cm: null }),
      item({ item_name: "B", category: "other", length_cm: null, width_cm: null, height_cm: null }),
      item({ item_name: "C", category: "other" }),
    ]);
    expect(r.confidence).toBe("low");
  });

  it("exposes a plain-English label for every confidence level", () => {
    expect(Object.keys(REQUIREMENT_CONFIDENCE_LABEL).sort()).toEqual(["high", "low", "medium"]);
  });

  it("always states its assumptions so the number is never a black box", () => {
    const r = estimateRequiredSpace([box]);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(r.assumptions.join(" ")).toContain("smallest face");
  });

  it("computes a required height from the resting stack", () => {
    const r = estimateRequiredSpace([item({ item_name: "Box", category: "boxes", quantity: 3 })]);
    expect(r.requiredHeightM).not.toBeNull();
    expect(r.requiredHeightM!).toBeGreaterThan(0);
  });
});
