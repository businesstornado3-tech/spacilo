/**
 * Phase 6AL — object-level verification.
 *
 * Every observed object is CONFIRMED, UNCONFIRMED or FORBIDDEN. A render is
 * shown when something is confirmed and nothing is forbidden; ambiguity is
 * reported, never treated as a hallucination.
 */
import { describe, expect, it } from "vitest";

import { categoriseVerification, type WhitelistEntry } from "./verification";

const items: WhitelistEntry[] = [
  { id: "ITEM-001", label: "Blue suitcase" },
  { id: "ITEM-002", label: "Red suitcase" },
  { id: "ITEM-003", label: "Television" },
];

const features: WhitelistEntry[] = [{ id: "FEATURE-001", label: "Garage door" }];

describe("object-level classification", () => {
  it("classifies a matched belonging as confirmed", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: ["ITEM-001", "ITEM-002", "ITEM-003"], unexpected: [], objects: ["Television"] },
    });
    expect(report.confirmedCount).toBeGreaterThan(0);
    expect(report.forbiddenCount).toBe(0);
    expect(report.usable).toBe(true);
  });

  it("treats an ambiguous description as unconfirmed, not forbidden", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: {
        present: ["ITEM-001", "ITEM-002", "ITEM-003"],
        unexpected: ["a case"],
        objects: [],
      },
    });
    expect(report.userInventory.unexpected).toEqual([]);
    expect(report.unconfirmed).toContain("a case");
    expect(report.unconfirmedCount).toBeGreaterThan(0);
    expect(report.forbiddenCount).toBe(0);
    expect(report.usable).toBe(true);
  });

  it("still forbids a genuinely invented object", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: ["ITEM-001", "ITEM-002", "ITEM-003"], unexpected: ["a bicycle"] },
    });
    expect(report.forbiddenCount).toBeGreaterThan(0);
    expect(report.usable).toBe(false);
  });

  it("keeps quantity protection: an extra unit is forbidden", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: {
        present: ["ITEM-003"],
        unexpected: [],
        objects: ["Television", "Television"],
      },
    });
    expect(report.forbiddenCount).toBeGreaterThan(0);
    expect(report.usable).toBe(false);
  });

  it("does not withhold a render just because the checker said nothing", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: [], unexpected: [] },
    });
    expect(report.usable).toBe(true);
  });

  it("records a per-object reason for every observation", () => {
    const report = categoriseVerification({
      items,
      features,
      reply: { present: ["ITEM-003"], unexpected: ["a bicycle"], objects: ["Television"] },
    });
    for (const observation of report.observations) {
      expect(observation.reason.length).toBeGreaterThan(0);
      expect(["confirmed", "unconfirmed", "forbidden"]).toContain(observation.classification);
    }
  });
});
