/**
 * Phase 6S — room feature separation in render verification.
 *
 * The live failure this locks down: "disappeared FEATURES - 001" was reported
 * to the user as "belongings you don't own" and a good render was thrown away.
 */
import { describe, expect, it } from "vitest";

import {
  categoriseVerification,
  classifyReported,
  type WhitelistEntry,
} from "./verification";
import { coverageFrom } from "./manifest";

const items: WhitelistEntry[] = [
  { id: "ITEM-001", label: "Television" },
  { id: "ITEM-002", label: "Suitcase" },
  { id: "ITEM-003", label: "Cardboard box" },
];

const features: WhitelistEntry[] = [
  { id: "FEATURE-001", label: "Door" },
  { id: "FEATURE-002", label: "Radiator" },
];

const allPresent = items.map((item) => item.id);

describe("classifyReported", () => {
  it("recognises a whitelisted belonging by id and by label", () => {
    expect(classifyReported("ITEM-001", { items, features })).toBe("user_item");
    expect(classifyReported("television", { items, features })).toBe("user_item");
  });

  it("recognises a room feature by id, in any spacing or plural form", () => {
    expect(classifyReported("FEATURE-001", { items, features })).toBe("room_feature");
    expect(classifyReported("FEATURES - 001", { items, features })).toBe("room_feature");
    expect(classifyReported("disappeared FEATURES-001", { items, features })).toBe("room_feature");
  });

  it("recognises architectural vocabulary even without a whitelist entry", () => {
    for (const label of ["garage door", "window", "skirting board", "consumer unit", "radiator pipe"]) {
      expect(classifyReported(label, { items, features: [] })).toBe("room_feature");
    }
  });

  it("still calls a genuinely invented belonging unexpected", () => {
    for (const label of ["a single shoe", "pair of shoes", "potted plant", "wooden chair"]) {
      expect(classifyReported(label, { items, features })).toBe("unexpected");
    }
  });
});

describe("categoriseVerification", () => {
  it("does not reject a render because a room feature drifted", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: allPresent, unexpected: ["disappeared FEATURES - 001"] },
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.roomFeatures.unexpected).toEqual(["disappeared FEATURES - 001"]);
    expect(report.verified).toBe(true);
  });

  it("routes missingFeatures away from the inventory verdict", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: allPresent, unexpected: [], missingFeatures: ["FEATURE-002"] },
    });
    expect(report.verified).toBe(true);
    expect(report.roomFeatures.unexpected).toContain("FEATURE-002");
  });

  it("still fails closed on an invented belonging", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: allPresent, unexpected: ["a single shoe"] },
    });
    expect(report.verified).toBe(false);
    expect(report.userInventory.unexpected).toEqual(["a single shoe"]);
  });

  it("still fails closed when a belonging is missing", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: ["ITEM-002", "ITEM-003"], unexpected: [] },
    });
    expect(report.verified).toBe(false);
    expect(report.userInventory.missing).toEqual(["ITEM-001"]);
  });

  it("treats a duplicate unit of a whitelisted item as faithful", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: allPresent, unexpected: ["extra cardboard boxes", "another suitcase"] },
    });
    expect(report.verified).toBe(true);
  });

  it("does not let a room feature in the present list count as an invention", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: [...allPresent, "FEATURE-001", "window"], unexpected: [] },
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.roomFeatures.found).toContain("FEATURE001");
  });
});

describe("coverageFrom keeps the client mirror honest", () => {
  it("reports feature drift separately from hallucinations", () => {
    const report = coverageFrom(["ITEM-001"], ["ITEM-001"], ["door frame", "a single shoe"]);
    expect(report.unexpected).toEqual(["a single shoe"]);
    expect(report.featureNotes).toEqual(["door frame"]);
    expect(report.faithful).toBe(false);
  });

  it("stays faithful when only the room drifted", () => {
    const report = coverageFrom(["ITEM-001"], ["ITEM-001"], ["radiator partially covered"]);
    expect(report.faithful).toBe(true);
    expect(report.complete).toBe(true);
  });
});
