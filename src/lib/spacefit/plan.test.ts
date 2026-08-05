/**
 * The frozen SpaceFit plan snapshot stored on requests and bookings. These
 * tests guard the contract that historical records keep rendering forever.
 */
import { describe, expect, it } from "vitest";

import {
  buildSpaceFitPlanSnapshot,
  hasSchematicGeometry,
  packSpaceFromListing,
  parsePlanSnapshot,
  SPACEFIT_PLAN_SNAPSHOT_VERSION,
  type PackSpaceSource,
} from "./plan";
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

const items = [
  item({ item_name: "Cardboard box", category: "boxes", quantity: 8 }),
  item({ item_name: "Sofa", category: "furniture", length_cm: 160, width_cm: 85, height_cm: 85 }),
];

const row: PackSpaceSource = {
  estimated_available_volume_m3: "16.5",
  total_volume_m3: 20,
  floor_area_m2: "12",
  height_m: 2.3,
  door_width_cm: "200",
  door_height_cm: 210,
  moisture_condition: "dry",
  temperature_condition: "normal_indoor",
  access_type: "independent",
  obstacles: [{ label: "Boiler" }],
};

describe("packSpaceFromListing", () => {
  it("coerces numeric strings from the listing row", () => {
    const s = packSpaceFromListing(row);
    expect(s.usableVolumeM3).toBe(16.5);
    expect(s.floorAreaM2).toBe(12);
    expect(s.doorWidthCm).toBe(200);
  });

  it("prefers the available volume over the total volume", () => {
    expect(packSpaceFromListing(row).usableVolumeM3).toBe(16.5);
  });

  it("falls back to the total volume when availability is unknown", () => {
    expect(packSpaceFromListing({ ...row, estimated_available_volume_m3: null }).usableVolumeM3).toBe(20);
  });

  it("returns nulls rather than NaN for missing geometry", () => {
    const s = packSpaceFromListing({});
    expect(s.usableVolumeM3).toBeNull();
    expect(s.floorAreaM2).toBeNull();
    expect(s.heightM).toBeNull();
  });

  it("treats empty strings as unknown", () => {
    expect(packSpaceFromListing({ height_m: "" }).heightM).toBeNull();
  });

  it("carries obstacles through when present", () => {
    expect(packSpaceFromListing(row).obstacles).toHaveLength(1);
  });

  it("defaults obstacles to an empty list when the projection omits them", () => {
    expect(packSpaceFromListing({ obstacles: null }).obstacles).toEqual([]);
  });
});

describe("buildSpaceFitPlanSnapshot", () => {
  const space = packSpaceFromListing(row);
  const snapshot = buildSpaceFitPlanSnapshot(items, space, new Date("2026-01-02T03:04:05.000Z"));

  it("stamps the snapshot version", () => {
    expect(snapshot.snapshotVersion).toBe(SPACEFIT_PLAN_SNAPSHOT_VERSION);
  });

  it("records every engine version it depended on", () => {
    expect(snapshot.algorithms.requirement).toBe("spacefit-requirement-v1");
    expect(snapshot.algorithms.pack).toBe("spacefit-pack-v1");
    expect(snapshot.algorithms.match).toBeTruthy();
  });

  it("records when it was captured", () => {
    expect(snapshot.capturedAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("freezes the requirement estimate", () => {
    expect(snapshot.requirement.itemCount).toBeGreaterThan(0);
    expect(snapshot.requirement.requiredVolumeM3).toBeGreaterThan(0);
    expect(snapshot.requirement.largestItemLabel).toBe("Sofa");
  });

  it("freezes the packing plan", () => {
    expect(snapshot.plan.zones.length).toBeGreaterThan(0);
    expect(snapshot.plan.loadingOrder.length).toBeGreaterThan(0);
  });

  it("freezes the geometry it reasoned against", () => {
    expect(snapshot.space).toEqual({
      usableVolumeM3: 16.5,
      floorAreaM2: 12,
      heightM: 2.3,
      doorWidthCm: 200,
      doorHeightCm: 210,
    });
  });

  it("is deterministic apart from the capture time", () => {
    const again = buildSpaceFitPlanSnapshot(items, space, new Date("2026-01-02T03:04:05.000Z"));
    expect(again).toEqual(snapshot);
  });

  it("survives a JSON round trip, as stored in the database", () => {
    expect(parsePlanSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("still builds a snapshot for an empty inventory", () => {
    const empty = buildSpaceFitPlanSnapshot([], space);
    expect(empty.requirement.itemCount).toBe(0);
    expect(empty.plan.zones).toHaveLength(0);
  });
});

describe("parsePlanSnapshot", () => {
  it("rejects null and primitives", () => {
    expect(parsePlanSnapshot(null)).toBeNull();
    expect(parsePlanSnapshot("plan")).toBeNull();
    expect(parsePlanSnapshot(42)).toBeNull();
  });

  it("rejects arrays", () => {
    expect(parsePlanSnapshot([])).toBeNull();
  });

  it("rejects objects without a plan", () => {
    expect(parsePlanSnapshot({ requirement: {} })).toBeNull();
  });

  it("rejects a plan without a loading order", () => {
    expect(parsePlanSnapshot({ plan: {}, requirement: {} })).toBeNull();
  });

  it("rejects a plan without a requirement", () => {
    expect(parsePlanSnapshot({ plan: { loadingOrder: [] } })).toBeNull();
  });

  it("accepts a minimal but valid stored plan", () => {
    expect(parsePlanSnapshot({ plan: { loadingOrder: [] }, requirement: {} })).not.toBeNull();
  });
});

describe("hasSchematicGeometry", () => {
  const zones = [{ key: "base" as const, title: "", description: "", items: [] }];

  it("draws only when floor area, height and zones are all known", () => {
    expect(hasSchematicGeometry({ zones }, { usableVolumeM3: 10, floorAreaM2: 12, heightM: 2.3, doorWidthCm: null, doorHeightCm: null })).toBe(true);
  });

  it("refuses without a floor area", () => {
    expect(hasSchematicGeometry({ zones }, { usableVolumeM3: 10, floorAreaM2: null, heightM: 2.3, doorWidthCm: null, doorHeightCm: null })).toBe(false);
  });

  it("refuses without a height", () => {
    expect(hasSchematicGeometry({ zones }, { usableVolumeM3: 10, floorAreaM2: 12, heightM: null, doorWidthCm: null, doorHeightCm: null })).toBe(false);
  });

  it("refuses when there is nothing to draw", () => {
    expect(hasSchematicGeometry({ zones: [] }, { usableVolumeM3: 10, floorAreaM2: 12, heightM: 2.3, doorWidthCm: null, doorHeightCm: null })).toBe(false);
  });

  it("refuses on zero dimensions rather than inventing precision", () => {
    expect(hasSchematicGeometry({ zones }, { usableVolumeM3: 0, floorAreaM2: 0, heightM: 0, doorWidthCm: null, doorHeightCm: null })).toBe(false);
  });
});
