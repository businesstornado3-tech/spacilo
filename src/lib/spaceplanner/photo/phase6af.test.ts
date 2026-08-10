/**
 * Phase 6AF regression tests — a generic description is not a duplicate.
 *
 * The live failure: an inventory of a blue and a red suitcase, plus a
 * television on its stand. The verifier described what it saw in plain words
 * ("suitcase", "suitcase", "television", "TV stand"). Longest-match accounting
 * poured both suitcases into ONE allowance, declared an excess, and rejected a
 * perfectly faithful render — while simultaneously reporting the other
 * suitcase missing.
 */
import { describe, expect, it } from "vitest";

import { categoriseVerification, quantityCheck } from "./verification";

const ITEMS = [
  { id: "ITEM-001", label: "blue suitcase" },
  { id: "ITEM-002", label: "red suitcase" },
  { id: "ITEM-003", label: "television" },
  { id: "ITEM-004", label: "TV stand" },
];

const WHITELISTS = { items: ITEMS, features: [] };

describe("Phase 6AF — capacity before blame", () => {
  it("spreads two generic suitcases across two suitcase allowances", () => {
    const { unexpected } = quantityCheck(
      ITEMS,
      ["suitcase", "suitcase", "television", "TV stand"],
      WHITELISTS,
    );
    expect(unexpected).toEqual([]);
  });

  it("still catches a third suitcase nobody owns", () => {
    const { unexpected } = quantityCheck(ITEMS, ["suitcase", "suitcase", "suitcase"], WHITELISTS);
    expect(unexpected.join(" ")).toContain("extra");
  });

  it("keeps the television and its stand as two distinct objects", () => {
    const { checks } = quantityCheck(ITEMS, ["television", "TV stand"], WHITELISTS);
    const tv = checks.find((check) => check.label === "television");
    const stand = checks.find((check) => check.label === "TV stand");
    expect(tv?.observed).toBe(1);
    expect(stand?.observed).toBe(1);
    expect(tv?.excess).toBe(0);
    expect(stand?.excess).toBe(0);
  });
});

describe("Phase 6AF — two sightings satisfy two items", () => {
  it("does not report the second suitcase missing", () => {
    const report = categoriseVerification({
      items: ITEMS,
      features: [],
      reply: {
        present: ["suitcase", "suitcase", "television", "TV stand"],
        unexpected: [],
        objects: ["suitcase", "suitcase", "television", "TV stand"],
      },
    });
    expect(report.userInventory.missing).toEqual([]);
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.verified).toBe(true);
  });

  it("still reports a genuinely absent object", () => {
    const report = categoriseVerification({
      items: ITEMS,
      features: [],
      reply: {
        present: ["suitcase", "television"],
        unexpected: [],
        objects: ["suitcase", "television"],
      },
    });
    expect(report.userInventory.missing).toContain("ITEM-004");
    expect(report.verified).toBe(false);
  });
});
