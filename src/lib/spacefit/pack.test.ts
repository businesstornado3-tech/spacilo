/**
 * Packing plan engine. The plan is advisory, so these tests focus on the
 * safety, ordering and honesty guarantees rather than exact geometry.
 */
import { describe, expect, it } from "vitest";

import { buildPackPlan, PACK_PLAN_DISCLAIMER, type PackSpace } from "./pack";
import { estimateRequiredSpace } from "./requirement";
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

function space(partial: Partial<PackSpace> = {}): PackSpace {
  return {
    usableVolumeM3: 18,
    floorAreaM2: 12,
    heightM: 2.3,
    doorWidthCm: 200,
    doorHeightCm: 210,
    moistureCondition: "dry",
    temperatureCondition: "normal_indoor",
    accessType: "independent",
    obstacles: [],
    ...partial,
  };
}

const boxes = item({ item_name: "Cardboard box", category: "boxes", quantity: 8 });
const sofa = item({ item_name: "Sofa", category: "furniture", length_cm: 160, width_cm: 85, height_cm: 85 });
const tv = item({ item_name: "Television", category: "electronics", fragile: true });

function plan(items: InventoryItem[], s: PackSpace = space()) {
  return buildPackPlan(items, estimateRequiredSpace(items), s);
}

describe("buildPackPlan", () => {
  it("stamps the pack algorithm version", () => {
    expect(plan([boxes]).algorithm).toBe("spacefit-pack-v1");
  });

  it("returns no zones for an empty inventory and says so in words", () => {
    const p = plan([]);
    expect(p.zones).toHaveLength(0);
    expect(p.textSummary).toContain("nothing in your inventory");
  });

  it("orders zones back-to-front", () => {
    const p = plan([boxes, sofa, tv]);
    expect(p.zones.map((z) => z.key)).toEqual(["back", "base", "front"]);
  });

  it("puts big furniture against the back wall", () => {
    const back = plan([sofa]).zones.find((z) => z.key === "back");
    expect(back?.items.map((i) => i.label)).toContain("Sofa");
  });

  it("puts boxes in the base layer", () => {
    expect(plan([boxes]).zones[0]?.key).toBe("base");
  });

  it("always puts fragile items at the front, whatever the category", () => {
    const fragileBox = item({ item_name: "Glassware box", category: "boxes", fragile: true });
    expect(plan([fragileBox]).zones[0]?.key).toBe("front");
  });

  it("moves non-stackable base items to the back", () => {
    const crate = item({ item_name: "Heavy crate", category: "boxes", stackable: "no" });
    expect(plan([crate]).zones[0]?.key).toBe("back");
  });

  it("sorts items within a zone by quantity", () => {
    const p = plan([
      item({ item_name: "Small box", category: "boxes", quantity: 2 }),
      item({ item_name: "Large box", category: "boxes", quantity: 9 }),
    ]);
    expect(p.zones[0]?.items[0]?.label).toBe("Large box");
  });

  it("produces a loading order that ends with a walkway reminder", () => {
    const order = plan([boxes, sofa]).loadingOrder;
    expect(order.length).toBeGreaterThan(1);
    expect(order.at(-1)).toContain("walkway");
  });

  it("gives no loading order when there is nothing to load", () => {
    expect(plan([]).loadingOrder).toHaveLength(0);
  });

  it("always warns about doorways, fire exits and meters", () => {
    expect(plan([boxes]).safety[0]).toContain("fire exit");
  });

  it("adds fragile-specific safety guidance", () => {
    expect(plan([tv]).safety.join(" ")).toContain("fragile");
  });

  it("adds non-stackable safety guidance", () => {
    const crate = item({ item_name: "Crate", category: "boxes", stackable: "no" });
    expect(plan([crate]).safety.join(" ")).toContain("not stackable");
  });

  it("warns when the space is not confirmed dry", () => {
    expect(plan([boxes], space({ moistureCondition: "some_humidity" })).safety.join(" ")).toContain("dry");
  });

  it("warns about unheated spaces", () => {
    expect(plan([boxes], space({ temperatureCondition: "unheated" })).safety.join(" ")).toContain("unheated");
  });

  it("surfaces host-flagged obstacles, capped at six", () => {
    const obstacles = Array.from({ length: 9 }, (_, i) => ({ label: `Obstacle ${i}` }));
    const safety = plan([boxes], space({ obstacles })).safety;
    expect(safety.filter((line) => line.includes("Keep clear of")).length).toBe(6);
  });

  it("computes utilisation against the usable volume", () => {
    const p = plan([boxes], space({ usableVolumeM3: 20 }));
    expect(p.utilisationPercent).not.toBeNull();
    expect(p.utilisationPercent!).toBeGreaterThan(0);
  });

  it("reports unknown utilisation when the space has no volume", () => {
    expect(plan([boxes], space({ usableVolumeM3: null })).utilisationPercent).toBeNull();
  });

  it("passes the floor-area check with plenty of room", () => {
    expect(plan([boxes], space({ floorAreaM2: 40 })).floorAreaCheck).toBe("pass");
  });

  it("fails the floor-area check when the footprint is too big", () => {
    expect(plan([boxes], space({ floorAreaM2: 0.2 })).floorAreaCheck).toBe("fail");
  });

  it("reports an unknown floor-area check with no measurement", () => {
    expect(plan([boxes], space({ floorAreaM2: null })).floorAreaCheck).toBe("unknown");
  });

  it("fails the headroom check when the stack is taller than the space", () => {
    expect(plan([boxes], space({ heightM: 0.2 })).headroomCheck).toBe("fail");
  });

  it("passes the headroom check in a normal garage", () => {
    expect(plan([boxes]).headroomCheck).toBe("pass");
  });

  it("fails the doorway check when the largest item cannot get through", () => {
    const p = plan([sofa], space({ doorWidthCm: 40, doorHeightCm: 40 }));
    expect(p.doorwayCheck).toBe("fail");
    expect(p.accessNotes.join(" ")).toContain("may not fit through the entrance");
  });

  it("asks the renter to confirm large items when the entrance is unmeasured", () => {
    const p = plan([sofa], space({ doorWidthCm: null, doorHeightCm: null }));
    expect(p.doorwayCheck).toBe("unknown");
    expect(p.accessNotes.join(" ")).toContain("entrance measurements");
  });

  it("tailors access notes to arranged access", () => {
    expect(plan([boxes], space({ accessType: "by_arrangement" })).accessNotes.join(" ")).toContain(
      "arranged with the host",
    );
  });

  it("tailors access notes to independent access", () => {
    expect(plan([boxes], space({ accessType: "independent" })).accessNotes.join(" ")).toContain(
      "independently",
    );
  });

  it("gives a full text equivalent of the diagram", () => {
    const p = plan([boxes, sofa]);
    expect(p.textSummary).toContain("Back wall");
    expect(p.textSummary).toContain("usable volume");
  });

  it("says so in the text summary when floor space looks tight", () => {
    const p = plan([boxes], space({ floorAreaM2: 0.62 }));
    expect(["tight", "fail"]).toContain(p.floorAreaCheck);
    expect(p.textSummary.toLowerCase()).toContain("floor space");
  });

  it("is deterministic", () => {
    expect(plan([boxes, sofa, tv])).toEqual(plan([boxes, sofa, tv]));
  });

  it("never claims a guarantee", () => {
    expect(PACK_PLAN_DISCLAIMER.toLowerCase()).toContain("not a guarantee");
  });
});
