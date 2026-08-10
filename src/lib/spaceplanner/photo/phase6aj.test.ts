/**
 * Phase 6AJ — best-effort partial arrangement.
 *
 * The product rule under test: one belonging that cannot fit is NOT an
 * arrangement failure. Everything that fits is arranged and rendered, the rest
 * is reported honestly, and the photographic preview stays eligible whenever at
 * least one unit was placed — without weakening hallucination or quantity
 * protection, and without touching Phase 6AI identity resolution.
 */
import { describe, expect, it } from "vitest";

import {
  manifestUnitCount,
  partialArrangementCounters,
  requiredRenderItems,
  unplacedAllowances,
  type PlacementManifest,
} from "./manifest";
import { buildRenderProjection } from "./render-projection";
import { categoriseVerification, type UnplacedAllowance, type WhitelistEntry } from "./verification";

type Entry = PlacementManifest["entries"][number];

function entry(
  id: string,
  label: string,
  options: { quantity?: number; placedUnits?: number } = {},
): Entry {
  const quantity = options.quantity ?? 1;
  const placedUnits = options.placedUnits ?? quantity;
  return {
    id,
    label,
    quantity,
    placedUnits,
    unplacedUnits: quantity - placedUnits,
    widthCm: 50,
    depthCm: 40,
    heightCm: 40,
    volumeM3: 0.08,
    placement: "against the left wall",
    orientation: "long edge parallel to the nearest wall",
    state: placedUnits === 0 ? "cannot be safely placed" : "placed",
    positions:
      placedUnits === 0
        ? []
        : [
            {
              xM: 0.1,
              yM: 0.1,
              baseHeightM: 0,
              widthM: 0.5,
              depthM: 0.4,
              heightM: 0.4,
              units: placedUnits,
              layer: 0,
              rotationDeg: 0,
              orientation: "flat",
              zone: "wall",
              mounted: false,
              supportSurfaceId: null,
              supportType: "FLOOR",
            },
          ],
  } as Entry;
}

function manifestOf(entries: Entry[], unplacedReasons: { label: string; reason: string }[] = []) {
  return {
    inventoryId: "inv-1",
    planHash: "plan-1",
    entries,
    roomFeatures: [],
    expectedUnits: entries.reduce((sum, item) => sum + item.quantity, 0),
    placedUnits: entries.reduce((sum, item) => sum + item.placedUnits, 0),
    spaceWidthM: 3,
    spaceDepthM: 4,
    spaceHeightM: 2.4,
    walkway: null,
    corridorSide: "left",
    strategy: "wall-first",
    qualityScore: 80,
    valid: true,
    violations: [],
    unplaced: unplacedReasons,
  } as unknown as PlacementManifest;
}

const whitelist = (rows: [string, string, number][]): WhitelistEntry[] =>
  rows.map(([id, label, quantity]) => ({ id, label, quantity }));

const allowances = (rows: [string, string, number][]): UnplacedAllowance[] =>
  rows.map(([id, label, quantity]) => ({ id, label, quantity, reason: "insufficient safe space" }));

describe("Phase 6AJ — TEST 1: everything fits", () => {
  it("requires every object in the photograph", () => {
    const manifest = manifestOf([
      entry("ITEM-001", "television"),
      entry("ITEM-002", "tv stand"),
      entry("ITEM-003", "grey suitcase"),
    ]);
    const counters = partialArrangementCounters(manifest);
    expect(counters).toMatchObject({ inventoryUnits: 3, placedUnits: 3, unplacedUnits: 0, partial: false });
    expect(buildRenderProjection(manifest).objects).toHaveLength(3);
    expect(unplacedAllowances(manifest)).toEqual([]);
  });
});

describe("Phase 6AJ — TEST 2: one item does not fit", () => {
  const manifest = manifestOf(
    [
      entry("ITEM-001", "television"),
      entry("ITEM-002", "tv stand"),
      entry("ITEM-003", "large suitcase", { placedUnits: 0 }),
    ],
    [{ label: "large suitcase", reason: "insufficient safe floor space" }],
  );

  it("is a partial success, not a failure", () => {
    const counters = partialArrangementCounters(manifest);
    expect(counters.partial).toBe(true);
    expect(counters.nothingPlaced).toBe(false);
    expect(counters.requiredRenderUnits).toBe(2);
  });

  it("keeps the photographic preview eligible with the placed objects only", () => {
    const projection = buildRenderProjection(manifest);
    expect(projection.objects.map((object) => object.label)).toEqual(["television", "tv stand"]);
    expect(projection.excluded.map((object) => object.reason)).toEqual(["not_placeable"]);
    expect(requiredRenderItems(manifest)).toHaveLength(2);
  });

  it("reports the unplaced item with its deterministic reason", () => {
    expect(unplacedAllowances(manifest)).toEqual([
      { id: "ITEM-003", label: "large suitcase", quantity: 1, reason: "insufficient safe floor space" },
    ]);
  });
});

describe("Phase 6AJ — TEST 3: several items do not fit", () => {
  it("still renders the three that do", () => {
    const manifest = manifestOf([
      entry("ITEM-001", "television"),
      entry("ITEM-002", "tv stand"),
      entry("ITEM-003", "grey suitcase"),
      entry("ITEM-004", "blue suitcase", { placedUnits: 0 }),
      entry("ITEM-005", "wardrobe", { placedUnits: 0 }),
      entry("ITEM-006", "chest freezer", { placedUnits: 0 }),
    ]);
    const counters = partialArrangementCounters(manifest);
    expect(counters).toMatchObject({ placedUnits: 3, unplacedUnits: 3, partial: true });
    expect(buildRenderProjection(manifest).objects).toHaveLength(3);
  });

  it("renders only the placed units of a partly-placed object", () => {
    const manifest = manifestOf([entry("ITEM-001", "cardboard box", { quantity: 5, placedUnits: 3 })]);
    expect(manifestUnitCount(manifest)).toBe(3);
    expect(buildRenderProjection(manifest).objects[0]!.quantity).toBe(3);
    expect(unplacedAllowances(manifest)[0]).toMatchObject({ label: "cardboard box", quantity: 2 });
  });
});

describe("Phase 6AJ — TEST 4: nothing fits", () => {
  it("asks for no photograph but keeps the plan and the reason", () => {
    const manifest = manifestOf(
      [entry("ITEM-001", "large suitcase", { placedUnits: 0 })],
      [{ label: "large suitcase", reason: "insufficient safe floor space" }],
    );
    const counters = partialArrangementCounters(manifest);
    expect(counters.nothingPlaced).toBe(true);
    expect(counters.partial).toBe(false);
    expect(buildRenderProjection(manifest).objects).toEqual([]);
    expect(unplacedAllowances(manifest)[0]!.reason).toBe("insufficient safe floor space");
  });
});

describe("Phase 6AJ — verification of a partial arrangement", () => {
  const placed = whitelist([
    ["ITEM-001", "television", 1],
    ["ITEM-002", "tv stand", 1],
  ]);
  const notPlaced = allowances([["ITEM-003", "blue suitcase", 1]]);

  it("TEST 5: an unplaced item still visible in the photo is not a hallucination", () => {
    const report = categoriseVerification({
      items: placed,
      features: [],
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand", "blue suitcase"],
      },
      unplaced: notPlaced,
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.verified).toBe(true);
  });

  it("TEST 6 & 8: a genuinely new object still rejects the preview", () => {
    const report = categoriseVerification({
      items: placed,
      features: [],
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand", "red chair"],
      },
      unplaced: notPlaced,
    });
    expect(report.userInventory.unexpected.join(" ")).toContain("red chair");
    expect(report.verified).toBe(false);
  });

  it("TEST 7: a duplicated placed object is still a quantity violation", () => {
    const report = categoriseVerification({
      items: whitelist([["ITEM-001", "television", 1]]),
      features: [],
      reply: { present: ["ITEM-001"], unexpected: [], objects: ["television", "television"] },
      unplaced: [],
    });
    expect(report.verified).toBe(false);
  });

  it("TEST 9: Phase 6AI identity variation still matches", () => {
    const report = categoriseVerification({
      items: whitelist([
        ["ITEM-001", "black backpack", 1],
        ["ITEM-002", "television", 1],
      ]),
      features: [],
      reply: { present: ["ITEM-001", "ITEM-002"], unexpected: [], objects: ["black bag", "TV"] },
      unplaced: [],
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.verified).toBe(true);
  });

  it("does not require unplaced inventory to appear at all", () => {
    const report = categoriseVerification({
      items: placed,
      features: [],
      reply: { present: ["ITEM-001", "ITEM-002"], unexpected: [], objects: ["television", "tv stand"] },
      unplaced: notPlaced,
    });
    expect(report.userInventory.missing).toEqual([]);
    expect(report.verified).toBe(true);
  });
});
