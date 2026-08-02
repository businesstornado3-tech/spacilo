/**
 * SpaceFit Vision — behavioural regression tests.
 *
 * Scenario: three photographs of the SAME garage belongings from different
 * angles. These assert BEHAVIOUR (no summing across photos, repeated items
 * consolidated with lowered quantity confidence, environment fixtures
 * classified rather than deleted), never exact model output.
 */
import { describe, expect, it } from "vitest";

import { reconcileDetections } from "@/lib/spacefit-vision/normalise";
import { detectionSchema, type VisionDetection } from "@/lib/spacefit-vision/schema";

function detection(partial: Partial<VisionDetection>): VisionDetection {
  return detectionSchema.parse({ label: "Item", ...partial });
}

/** Provider output for three overlapping photos of one garage. */
const GARAGE_RUN: VisionDetection[] = [
  // Bicycle seen in all three photos, grouped by the provider.
  detection({
    label: "Adult bicycle",
    suggested_category: "bicycles",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    source_photo_indexes: [0, 1, 2],
    possible_duplicate_group: "bike-1",
    duplicate_certainty: "likely_same",
  }),
  // Two distinct suitcases, each seen more than once.
  detection({
    label: "Blue suitcase",
    suggested_category: "bags",
    suggested_catalogue_key: "large-suitcase",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    source_photo_indexes: [0, 1],
    possible_duplicate_group: "case-blue",
    duplicate_certainty: "likely_same",
  }),
  detection({
    label: "Grey suitcase",
    suggested_category: "bags",
    suggested_catalogue_key: "medium-suitcase",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    source_photo_indexes: [1, 2],
    possible_duplicate_group: "case-grey",
    duplicate_certainty: "likely_same",
  }),
  detection({
    label: "Black duffel bag",
    suggested_category: "bags",
    suggested_catalogue_key: "duffel-bag",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    source_photo_indexes: [2],
  }),
  detection({
    label: "Plastic storage box",
    suggested_category: "boxes",
    suggested_catalogue_key: "plastic-storage-box",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    source_photo_indexes: [0, 2],
    possible_duplicate_group: "clear-box",
    duplicate_certainty: "likely_same",
  }),
  // Same stack of cardboard boxes counted separately in each photo.
  detection({
    label: "Cardboard boxes — mixed sizes",
    suggested_category: "boxes",
    suggested_catalogue_key: "medium-box",
    estimated_quantity: 10,
    minimum_plausible_quantity: 8,
    maximum_plausible_quantity: 12,
    object_confidence: "high",
    quantity_confidence: "medium",
    repeated_item_group: true,
    source_photo_indexes: [0],
    possible_duplicate_group: "box-stack",
    duplicate_certainty: "likely_same",
  }),
  detection({
    label: "Cardboard boxes",
    suggested_category: "boxes",
    suggested_catalogue_key: "medium-box",
    estimated_quantity: 11,
    object_confidence: "high",
    quantity_confidence: "low",
    repeated_item_group: true,
    source_photo_indexes: [1],
    possible_duplicate_group: "box-stack",
    duplicate_certainty: "likely_same",
  }),
  detection({
    label: "Cardboard boxes",
    suggested_category: "boxes",
    suggested_catalogue_key: "medium-box",
    estimated_quantity: 10,
    object_confidence: "high",
    quantity_confidence: "medium",
    repeated_item_group: true,
    source_photo_indexes: [2],
    possible_duplicate_group: "box-stack",
    duplicate_certainty: "likely_same",
  }),
  // Garage racking in the background.
  detection({
    label: "Metal shelving unit",
    suggested_category: "furniture",
    estimated_quantity: 1,
    object_confidence: "high",
    quantity_confidence: "high",
    inventory_intent: "likely_environment",
    source_photo_indexes: [0, 1, 2],
  }),
];

describe("SpaceFit Vision — three views of one garage", () => {
  const result = reconcileDetections(GARAGE_RUN);
  const find = (needle: string) =>
    result.find((d) => d.label.toLowerCase().includes(needle))!;

  it("keeps unique objects at quantity 1 across overlapping photos", () => {
    for (const needle of ["bicycle", "blue suitcase", "grey suitcase", "duffel", "plastic storage"]) {
      const item = find(needle);
      expect(item, needle).toBeDefined();
      expect(item.estimated_quantity, needle).toBe(1);
      expect(item.quantity_confidence, needle).toBe("high");
    }
  });

  it("keeps the two suitcases as separate belongings", () => {
    const suitcases = result.filter((d) => d.label.toLowerCase().includes("suitcase"));
    expect(suitcases).toHaveLength(2);
  });

  it("consolidates repeated cardboard boxes into one suggestion", () => {
    const boxes = result.filter((d) => d.label.toLowerCase().startsWith("cardboard"));
    expect(boxes).toHaveLength(1);
  });

  it("never sums repeated-item counts across photos", () => {
    const boxes = find("cardboard");
    // 10 + 11 + 10 = 31 would be wrong; the largest single sighting is right.
    expect(boxes.estimated_quantity).toBe(11);
    expect(boxes.estimated_quantity).toBeLessThan(31);
  });

  it("lowers quantity confidence for overlapping repeated items but keeps object confidence", () => {
    const boxes = find("cardboard");
    expect(boxes.object_confidence).toBe("high");
    expect(["medium", "low"]).toContain(boxes.quantity_confidence);
    expect(boxes.minimum_plausible_quantity).toBeLessThanOrEqual(boxes.estimated_quantity);
    expect(boxes.maximum_plausible_quantity).toBeGreaterThanOrEqual(boxes.estimated_quantity);
  });

  it("classifies garage racking as environment without deleting it", () => {
    const shelving = find("shelving");
    expect(shelving).toBeDefined();
    expect(shelving.inventory_intent).toBe("likely_environment");
  });

  it("records every photo a merged detection was seen in", () => {
    expect(find("bicycle").source_photo_indexes).toEqual([0, 1, 2]);
  });
});
