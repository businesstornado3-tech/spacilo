/**
 * Phase 6AH — partial arrangement and intentionally unplaced belongings.
 *
 * The product invariant under test: an item that does not fit is NOT an
 * arrangement failure. The deterministic plan stays valid, unplaced items are
 * reported explicitly, they are never sent to the renderer, and if the render
 * shows them anyway they are permitted — capped at the unplaced quantity —
 * without weakening hallucination, duplicate or identity protection.
 */
import { describe, expect, it } from "vitest";

import {
  categoriseVerification,
  quantityCheck,
  unplacedLedger,
  type UnplacedAllowance,
  type WhitelistEntry,
} from "./verification";

const items = (...rows: [string, string, number][]): WhitelistEntry[] =>
  rows.map(([id, label, quantity]) => ({ id, label, quantity }));

const whitelistsFor = (list: WhitelistEntry[]) => ({ items: list, features: [] });

const unplaced = (...rows: [string, string, number][]): UnplacedAllowance[] =>
  rows.map(([id, label, quantity]) => ({ id, label, quantity, reason: "not_placeable" }));

describe("unplaced ledger", () => {
  it("consumes an allowance once and no more", () => {
    const ledger = unplacedLedger(unplaced(["ITEM-003", "blue suitcase", 1]));
    expect(ledger.claim("blue suitcase", 1)).toBe(0);
    expect(ledger.claim("blue suitcase", 1)).toBe(1);
  });

  it("permits a generic description of an unplaced belonging", () => {
    const ledger = unplacedLedger(unplaced(["ITEM-003", "blue suitcase", 1]));
    expect(ledger.claim("suitcase", 1)).toBe(0);
  });

  it("never permits an object that is not on the unplaced list", () => {
    const ledger = unplacedLedger(unplaced(["ITEM-003", "blue suitcase", 1]));
    expect(ledger.claim("shoes", 1)).toBe(1);
  });
});

describe("verification with intentionally unplaced items", () => {
  const placed = items(["ITEM-001", "television", 1], ["ITEM-002", "tv stand", 1]);
  const notPlaced = unplaced(["ITEM-003", "blue suitcase", 1]);

  it("an unplaced object in the image is not a hallucination", () => {
    const report = categoriseVerification({
      ...whitelistsFor(placed),
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand", "blue suitcase"],
      },
      unplaced: notPlaced,
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.permittedUnplaced).toContain("blue suitcase");
    expect(report.verified).toBe(true);
  });

  it("a genuinely invented object still fails closed alongside an unplaced one", () => {
    const report = categoriseVerification({
      ...whitelistsFor(placed),
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand", "blue suitcase", "shoes"],
      },
      unplaced: notPlaced,
    });
    expect(report.userInventory.unexpected.join(" ")).toContain("shoes");
    expect(report.verified).toBe(false);
  });

  it("unplaced ×1 does not permit three appearances", () => {
    const report = categoriseVerification({
      ...whitelistsFor(placed),
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["television", "tv stand", "3x blue suitcase"],
      },
      unplaced: notPlaced,
    });
    expect(report.userInventory.unexpected.join(" ")).toContain("blue suitcase");
    expect(report.verified).toBe(false);
  });

  it("an unplaced object cannot satisfy a required placed object", () => {
    const required = items(["ITEM-001", "television", 1], ["ITEM-002", "tv stand", 1]);
    const report = categoriseVerification({
      ...whitelistsFor(required),
      reply: { present: ["ITEM-001"], unexpected: [], objects: ["television", "blue suitcase"] },
      unplaced: unplaced(["ITEM-003", "blue suitcase", 1]),
    });
    expect(report.userInventory.missing).toContain("ITEM-002");
    expect(report.verified).toBe(false);
  });

  it("keeps TV distinct from TV stand", () => {
    const report = categoriseVerification({
      ...whitelistsFor(items(["ITEM-001", "television", 1])),
      reply: { present: [], unexpected: [], objects: ["tv stand"] },
      unplaced: [],
    });
    expect(report.verified).toBe(false);
  });

  it("keeps blue and grey suitcases distinct while allowing generic sightings", () => {
    const report = categoriseVerification({
      ...whitelistsFor(items(["ITEM-001", "blue suitcase", 1], ["ITEM-002", "grey suitcase", 1])),
      reply: {
        present: ["ITEM-001", "ITEM-002"],
        unexpected: [],
        objects: ["suitcase", "suitcase"],
      },
      unplaced: [],
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.quantityShortfalls).toEqual([]);
  });

  it("still reports a genuine quantity mismatch", () => {
    const check = quantityCheck(
      items(["ITEM-001", "cardboard box", 3]),
      ["2x cardboard box"],
      whitelistsFor(items(["ITEM-001", "cardboard box", 3])),
      [],
    );
    expect(check.shortfalls.join(" ")).toContain("cardboard box");
  });
});
