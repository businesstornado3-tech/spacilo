/**
 * Regression: the same space must score identically whichever RPC projection
 * it arrived from (list rows expose photo_count, detail rows expose photo_paths).
 */
import { describe, expect, it } from "vitest";

import { toMatchSpace } from "./adapters";
import { buildMatchInventory, evaluateSpace } from "./engine";
import type { InventoryItem } from "@/lib/inventory-model";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Part of the space",
  space_type: "garage",
  postcode_district: "PO1",
  approximate_area: "Portsmouth",
  monthly_price_pence: 5500,
  estimated_available_volume_m3: 18,
  total_volume_m3: 36,
  accepted_categories: ["boxes", "furniture", "student"],
  host_restrictions: [],
  restriction_notes: null,
  features: ["dry", "indoor", "lockable", "cctv"],
  access_type: "by_arrangement",
  moisture_condition: "dry",
  temperature_condition: "normal_indoor",
  door_width_cm: null,
  door_height_cm: null,
};

const listRow = { ...base, photo_count: 3, cover_path: "a/1.jpg" };
const detailRow = { ...base, photo_paths: ["a/1.jpg", "a/2.jpg", "a/3.jpg"] };

const items: InventoryItem[] = [
  {
    id: "i1",
    inventory_id: "inv",
    catalogue_key: null,
    label: "Medium box",
    category: "boxes",
    quantity: 10,
    length_cm: 45,
    width_cm: 35,
    height_cm: 35,
    notes: null,
    source: "manual",
  } as unknown as InventoryItem,
  {
    id: "i2",
    inventory_id: "inv",
    catalogue_key: null,
    label: "Desk",
    category: "furniture",
    quantity: 1,
    length_cm: 120,
    width_cm: 60,
    height_cm: 75,
    notes: null,
    source: "manual",
  } as unknown as InventoryItem,
];

describe("SpaceFit score consistency across surfaces", () => {
  const inventory = buildMatchInventory(items);
  const fromList = evaluateSpace(toMatchSpace(listRow), inventory);
  const fromDetail = evaluateSpace(toMatchSpace(detailRow), inventory);

  it("produces the same total score", () => {
    expect(fromDetail.score).toBe(fromList.score);
  });

  it("produces the same component scores", () => {
    expect(fromDetail.components).toEqual(fromList.components);
  });

  it("produces the same explanations and compatibility", () => {
    expect(fromDetail.compatible).toBe(fromList.compatible);
    expect(fromDetail.label).toBe(fromList.label);
    expect(fromDetail.positives).toEqual(fromList.positives);
    expect(fromDetail.warnings).toEqual(fromList.warnings);
    expect(fromDetail.hard_failures).toEqual(fromList.hard_failures);
  });

  it("counts photos for match information from either projection", () => {
    expect(fromDetail.components?.completeness.score).toBe(5);
  });

  it("keeps hard failures consistent across surfaces", () => {
    const tiny = { ...listRow, estimated_available_volume_m3: 0.1 };
    const tinyDetail = { ...detailRow, estimated_available_volume_m3: 0.1 };
    const a = evaluateSpace(toMatchSpace(tiny), inventory);
    const b = evaluateSpace(toMatchSpace(tinyDetail), inventory);
    expect(a.compatible).toBe(false);
    expect(b.compatible).toBe(false);
    expect(a.score).toBeNull();
    expect(b.score).toBeNull();
  });
});
