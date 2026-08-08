/**
 * The Spacilo AI Score and the capability model.
 *
 * Both are load-bearing: the score is shown to renters before payment and to
 * hosts before accepting, and the capability model is the only thing standing
 * between a visitor preview and the full planner.
 */
import { describe, expect, it } from "vitest";

import {
  SPACE_BY_ID,
  CATALOGUE_BY_ID,
  bandFor,
  capabilitiesFor,
  recommendationFor,
  simulationEngine,
  spaciloScore,
  type InventoryLine,
} from "@/lib/spaceplanner";

const garage = SPACE_BY_ID.get("garage")!;

function lines(entries: Array<[string, number]>): InventoryLine[] {
  return entries.map(([id, quantity]) => ({ item: CATALOGUE_BY_ID.get(id)!, quantity }));
}

describe("Spacilo AI Score", () => {
  it("bands ascend with the score", () => {
    expect(bandFor(98)).toBe("Excellent fit");
    expect(bandFor(90)).toBe("Very good fit");
    expect(bandFor(81)).toBe("Good fit");
    expect(bandFor(74)).toBe("Tight fit");
    expect(bandFor(58)).toBe("Consider a larger space");
    expect(bandFor(35)).toBe("Not recommended");
  });

  it("is deterministic for the same inventory and space", () => {
    const input = lines([["medium-box", 6]]);
    const a = spaciloScore(simulationEngine.plan(input, garage));
    const b = spaciloScore(simulationEngine.plan(input, garage));
    expect(a.value).toBe(b.value);
  });

  it("scores a light load higher than an overloaded one", () => {
    const light = spaciloScore(simulationEngine.plan(lines([["medium-box", 4]]), garage));
    const heavy = spaciloScore(simulationEngine.plan(lines([["medium-box", 400]]), garage));
    expect(light.value).toBeGreaterThan(heavy.value);
    expect(heavy.checks.find((c) => c.id === "fit")?.state).toBe("failed");
  });

  it("stays within 0–100 and always names a recommendation", () => {
    const score = spaciloScore(simulationEngine.plan(lines([["medium-box", 900]]), garage));
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(100);
    expect(recommendationFor(score.band)).toBeTruthy();
  });
});

describe("planner capabilities", () => {
  it("caps the visitor preview at four kinds of belongings", () => {
    const visitor = capabilitiesFor("visitor");
    expect(visitor.maxItemTypes).toBe(4);
    expect(visitor.canSavePlans).toBe(false);
    expect(visitor.canUploadPhotos).toBe(false);
    expect(visitor.canUseRecognition).toBe(false);
    expect(visitor.canCompareSpaces).toBe(false);
    expect(visitor.canBook).toBe(false);
  });

  it("unlocks the full planner for renters", () => {
    const renter = capabilitiesFor("renter");
    expect(renter.maxItemTypes).toBe(Number.POSITIVE_INFINITY);
    expect(renter.canSavePlans).toBe(true);
    expect(renter.canCompareSpaces).toBe(true);
  });

  it("gives hosts the review surface instead of booking", () => {
    const host = capabilitiesFor("host");
    expect(host.canReviewBooking).toBe(true);
    expect(host.canBook).toBe(false);
  });

  it("keeps premium switched off everywhere for now", () => {
    for (const mode of ["visitor", "renter", "host"] as const) {
      expect(capabilitiesFor(mode).premium).toBe(false);
    }
  });
});
