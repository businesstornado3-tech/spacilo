import { describe, expect, it } from "vitest";

import { buildInnovationRecommendations, emptyTotals, rankOpportunities, responseRate, totalsByOpportunity } from "./learning";
import type { GrowthLearningSignal, GrowthOpportunity } from "./types";

function opportunity(key: string, frequency = 3): GrowthOpportunity {
  return { key, signalId: `signal:${key}`, connectorId: "first_party", situation: { summary: "Recurring need", achieving: null, problem: "capacity", cause: null, need: "space", likelyNext: null, urgency: "unknown", belongings: [], spaces: [], temporary: null, residentialOrBusiness: "residential", location: { label: "Bath", slug: "bath", kind: "place" }, confidence: 0.8, evidence: [], reading: {} as GrowthOpportunity["situation"]["reading"] }, painPoints: [], audience: { roles: ["RENTER"], primary: "RENTER", segment: "general", discoveryRole: "renter", confidence: 0.8, evidence: [] }, fit: { verdict: "NEW_OPPORTUNITY", capabilities: [], destination: null, reasons: [], confidence: 0.8 }, supply: { level: "LEVEL_1_NO_SUPPLY", publishedSpaces: 0, ctaMode: "capture_demand", mayClaimAvailability: false, reasons: [] }, scores: { opportunity: 50, campaignEligibility: 50, conversionLikelihood: 30, sourceConfidence: 0.8, intentConfidence: 0.8, band: "possible", factors: [] }, decision: { value: "CAPTURE_ONLY", reasons: [] }, status: "OBSERVING", firstSeen: 1, latestSeen: 1, frequency, evidence: [] };
}

const signals: GrowthLearningSignal[] = [
  { opportunityKey: "a", channel: "email", outcome: "sent", at: 1 },
  { opportunityKey: "a", channel: "email", outcome: "responded", at: 2 },
  { opportunityKey: "a", channel: "email", outcome: "converted", valuePence: 500, at: 3 },
  { opportunityKey: "b", channel: null, outcome: "blocked", at: 4 },
];

describe("growth learning", () => {
  it("aggregates outcomes and leaves an unsent response rate unknown", () => {
    const totals = totalsByOpportunity(signals);
    expect(totals.get("a")?.converted).toBe(1);
    expect(totals.get("a")?.valuePence).toBe(500);
    expect(responseRate(totals.get("a")!)).toBe(2);
    expect(responseRate(emptyTotals())).toBeNull();
  });

  it("bounds learned ranking adjustments", () => {
    const ranked = rankOpportunities([opportunity("a"), opportunity("b")], totalsByOpportunity(signals));
    expect(ranked[0]?.learnedScore).toBeGreaterThanOrEqual(0);
    expect(ranked[0]?.learnedScore).toBeLessThanOrEqual(100);
    expect(Math.abs((ranked.find((item) => item.key === "a")?.learnedScore ?? 50) - 50)).toBeLessThanOrEqual(15);
  });

  it("only recommends repeated opportunities and never auto-publishes them", () => {
    const recommendations = buildInnovationRecommendations([opportunity("a", 3), opportunity("single", 1)], totalsByOpportunity(signals), 3);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.kind).toBe("PRODUCT");
    expect(recommendations[0]?.recommendation).toContain("Review");
  });
});
