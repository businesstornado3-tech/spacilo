/**
 * Phase 6AM — object-level support mismatch.
 *
 * A KNOWN belonging drawn on the wrong support is EXCLUDED from the verified
 * set. It no longer promotes itself to a whole-image rejection: the remaining
 * correctly rendered objects stay visible and the verdict is PARTIAL.
 */
import { describe, expect, it } from "vitest";

import { coverageOf, verdictFor, type Coverage } from "@/routes/api/spaceplanner-visualise";

import {
  categoriseVerification,
  supportDriftDetailed,
  type ExpectedSupport,
  type WhitelistEntry,
} from "./verification";

const tenItems: WhitelistEntry[] = [
  { id: "ITEM-001", label: "Television" },
  { id: "ITEM-002", label: "TV stand" },
  { id: "ITEM-003", label: "Blue suitcase" },
  { id: "ITEM-004", label: "Grey suitcase" },
  { id: "ITEM-005", label: "Laptop bag" },
  { id: "ITEM-006", label: "Small plastic bottle with blue cap" },
  { id: "ITEM-007", label: "Cloth draped table" },
  { id: "ITEM-008", label: "Cardboard box" },
  { id: "ITEM-009", label: "Bicycle helmet" },
  { id: "ITEM-010", label: "Toolbox" },
];

const allIds = tenItems.map((entry) => entry.id);

const bottleOnTable: ExpectedSupport = {
  itemId: "ITEM-006",
  itemLabel: "Small plastic bottle with blue cap",
  baseId: "ITEM-007",
  baseLabel: "Cloth draped table",
};

const helmetOnBox: ExpectedSupport = {
  itemId: "ITEM-009",
  itemLabel: "Bicycle helmet",
  baseId: "ITEM-008",
  baseLabel: "Cardboard box",
};

function coverage(
  items: WhitelistEntry[],
  present: string[],
  unexpected: string[],
  supports: { item: string; restingOn: string }[],
  expectedSupports: ExpectedSupport[],
): Coverage {
  return coverageOf(
    items,
    [],
    { present, unexpected, objects: [], supports },
    [],
    expectedSupports,
  );
}

describe("Phase 6AM — support mismatch is object-level", () => {
  it("TEST 1 — one support mismatch keeps the preview: 9 confirmed, 1 excluded", () => {
    const report = categoriseVerification({
      items: tenItems,
      features: [],
      reply: {
        present: allIds,
        unexpected: [],
        objects: [],
        supports: [{ item: "ITEM-006", restingOn: "floor" }],
      },
      expectedSupports: [bottleOnTable],
    });
    expect(report.supportMismatchCount).toBe(1);
    expect(report.excludedCount).toBe(1);
    expect(report.confirmedCount).toBe(9);
    expect(report.forbiddenCount).toBe(0);
    expect(report.materialIssues).toEqual([]);
    expect(report.usable).toBe(true);
    // Strict verification still records the drift.
    expect(report.verified).toBe(false);

    const cover = coverage(
      tenItems,
      allIds,
      [],
      [{ item: "ITEM-006", restingOn: "floor" }],
      [bottleOnTable],
    );
    expect(verdictFor(cover)).toBe("partial");
    expect(cover.usable).toBe(true);
  });

  it("TEST 2 — two support mismatches still show the preview", () => {
    const cover = coverage(
      tenItems,
      allIds,
      [],
      [
        { item: "ITEM-006", restingOn: "floor" },
        { item: "ITEM-009", restingOn: "floor" },
      ],
      [bottleOnTable, helmetOnBox],
    );
    expect(cover.supportMismatchCount).toBe(2);
    expect(cover.excludedCount).toBe(2);
    expect(cover.confirmedCount).toBe(8);
    expect(cover.usable).toBe(true);
    expect(verdictFor(cover)).toBe("partial");
  });

  it("TEST 3 — a genuinely invented object is still a global rejection", () => {
    const cover = coverage(tenItems, allIds, ["a bicycle"], [], []);
    expect(cover.faithful).toBe(false);
    expect(cover.usable).toBe(false);
    expect(verdictFor(cover)).toBe("unfaithful");
  });

  it("TEST 3b — quantity protection is unchanged", () => {
    const report = categoriseVerification({
      items: [{ id: "ITEM-003", label: "Blue suitcase", quantity: 1 }],
      features: [],
      reply: { present: ["ITEM-003"], unexpected: [], objects: ["blue suitcase", "blue suitcase"] },
    });
    expect(report.forbiddenCount).toBeGreaterThan(0);
    expect(report.usable).toBe(false);
  });

  it("TEST 3c — TV vs TV stand protection is unchanged", () => {
    const report = categoriseVerification({
      items: [
        { id: "ITEM-001", label: "Television", quantity: 1 },
        { id: "ITEM-002", label: "TV stand", quantity: 1 },
      ],
      features: [],
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand"],
      },
    });
    expect(report.forbiddenCount).toBe(0);
    expect(report.usable).toBe(true);
  });

  it("TEST 4 — intentionally unplaced belongings never reject globally", () => {
    const placed = tenItems.slice(0, 8);
    const report = categoriseVerification({
      items: placed,
      features: [],
      reply: {
        present: placed.map((entry) => entry.id),
        unexpected: ["bicycle helmet"],
        objects: [],
      },
      unplaced: [
        { id: "ITEM-009", label: "Bicycle helmet", quantity: 1, reason: "no space left" },
        { id: "ITEM-010", label: "Toolbox", quantity: 1, reason: "no space left" },
      ],
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.usable).toBe(true);
    expect(report.permittedUnplaced.length).toBeGreaterThan(0);
  });

  it("TEST 5 — an oversized item that does not fit causes no preview failure", () => {
    const placed = tenItems.slice(0, 9);
    const cover = coverageOf(
      placed,
      [],
      { present: placed.map((entry) => entry.id), unexpected: [], objects: [] },
      [],
      [],
      [{ id: "ITEM-010", label: "Toolbox", quantity: 1, reason: "too large for the space" }],
    );
    expect(cover.faithful).toBe(true);
    expect(cover.usable).toBe(true);
    expect(verdictFor(cover)).toBe("verified");
  });

  it("TEST 6 — mixed partial case: 12 valid, 2 excluded, 1 unplaced", () => {
    const fifteen: WhitelistEntry[] = Array.from({ length: 15 }, (_, index) => ({
      id: `ITEM-${String(index + 1).padStart(3, "0")}`,
      label: `Object ${index + 1}`,
    }));
    const placed = fifteen.slice(0, 14);
    const supports: ExpectedSupport[] = [
      { itemId: "ITEM-013", itemLabel: "Object 13", baseId: "ITEM-001", baseLabel: "Object 1" },
      { itemId: "ITEM-014", itemLabel: "Object 14", baseId: "ITEM-002", baseLabel: "Object 2" },
    ];
    const cover = coverageOf(
      placed,
      [],
      {
        present: placed.map((entry) => entry.id),
        unexpected: [],
        objects: [],
        supports: [
          { item: "ITEM-013", restingOn: "floor" },
          { item: "ITEM-014", restingOn: "floor" },
        ],
      },
      [],
      supports,
      [{ id: "ITEM-015", label: "Object 15", quantity: 1, reason: "no space left" }],
    );
    expect(cover.confirmedCount).toBe(12);
    expect(cover.excludedCount).toBe(2);
    expect(cover.usable).toBe(true);
    expect(verdictFor(cover)).toBe("partial");
  });

  it("TEST 7 — zero valid objects means no photographic preview", () => {
    const cover = coverageOf(
      tenItems,
      [],
      { present: [], unexpected: ["a bicycle"], objects: ["a bicycle"] },
      [],
      [],
    );
    expect(cover.confirmedCount).toBe(0);
    expect(cover.usable).toBe(false);
    expect(verdictFor(cover)).toBe("unfaithful");
  });
});

describe("Phase 6AM — accounting consistency", () => {
  it("attributes each drift to exactly one object, once", () => {
    const mismatches = supportDriftDetailed(
      [bottleOnTable, bottleOnTable],
      [{ item: "ITEM-006", restingOn: "floor" }],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.itemId).toBe("ITEM-006");
    expect(mismatches[0]!.observedBase).toBe("the floor");
  });

  it("does not count one unplaced unit in two verifier lists", () => {
    const report = categoriseVerification({
      items: [
        { id: "ITEM-001", label: "Blue suitcase" },
        { id: "ITEM-002", label: "Grey suitcase" },
      ],
      features: [],
      reply: { present: ["ITEM-001"], unexpected: ["grey suitcase"], objects: [] },
      unplaced: [{ id: "ITEM-002", label: "Grey suitcase", quantity: 1, reason: "no space left" }],
    });
    const permitted = report.permittedUnplaced.map((value) => value.toLowerCase());
    for (const entry of report.unconfirmed) {
      expect(permitted).not.toContain(entry.toLowerCase());
    }
    expect(report.excludedCount).toBe(report.excluded.length);
  });
});
