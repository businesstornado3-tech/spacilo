import { describe, expect, it } from "vitest";

import { buildCampaign, buildMessage, campaignFingerprint, cooldownWindowStart, digest, mayRetry, recipientHash } from "./campaign";
import type { CampaignDecision, GrowthOpportunity, PolicyDecision, SupplyContext } from "./types";

const opportunity = { key: "opp_campaign", audience: { primary: "RENTER", roles: ["RENTER"], segment: "general", discoveryRole: "renter", confidence: 0.8, evidence: [] }, situation: { summary: "A renter needs space", achieving: null, problem: "capacity", cause: null, need: "storage", likelyNext: null, urgency: "unknown", belongings: [], spaces: [], temporary: null, residentialOrBusiness: "residential", location: { label: "Bath", slug: "bath", kind: "place" }, confidence: 0.8, evidence: [], reading: {} }, fit: { verdict: "BEST_EXISTING_SOLUTION", capabilities: [], destination: null, reasons: [], confidence: 0.8 }, scores: { opportunity: 70, campaignEligibility: 70, conversionLikelihood: 40, sourceConfidence: 0.8, intentConfidence: 0.8, band: "strong", factors: [] }, supply: { level: "LEVEL_1_NO_SUPPLY", publishedSpaces: 0, ctaMode: "capture_demand", mayClaimAvailability: false, reasons: [] }, painPoints: [], signalId: "signal_campaign", connectorId: "first_party", decision: { value: "CAPTURE_ONLY", reasons: [] }, status: "ACTIONABLE", firstSeen: 1, latestSeen: 1, frequency: 1, evidence: [{ quote: "no room", field: "problem" }] } as unknown as GrowthOpportunity;
const supply: SupplyContext = { level: "LEVEL_1_NO_SUPPLY", publishedSpaces: 0, ctaMode: "capture_demand", mayClaimAvailability: false, reasons: [] };
const decision: CampaignDecision = { value: "CAMPAIGN_LATER", reasons: ["waiting"] };
const policy: PolicyDecision = { verdict: "DEFER", checks: [], reasons: ["configuration"], requiresConfiguration: false };

describe("campaign lifecycle", () => {
  it("uses stable non-secret digests and recipient references", () => {
    expect(digest("same")).toBe(digest("same"));
    expect(recipientHash("email", " Test@Example.com ")).toBe(recipientHash("email", "test@example.com"));
    expect(campaignFingerprint({ opportunityKey: "opp", channel: "email", recipient: "rcp", windowStart: 10 })).toBe(campaignFingerprint({ opportunityKey: "opp", channel: "email", recipient: "rcp", windowStart: 10 }));
  });

  it("never claims availability when supply is absent", () => {
    const message = buildMessage(opportunity, supply);
    expect(message.body).toContain("cannot promise availability");
    expect(message.body).not.toContain("listed in Bath right now");
    expect(message.claims.some((claim) => claim.claim.includes("availability"))).toBe(true);
  });

  it("creates a deterministic deferred record and permits only bounded retries", () => {
    const first = buildCampaign({ opportunity, supply, decision, policy, channel: "email", recipient: "rcp_1", now: 1_000_000 });
    const second = buildCampaign({ opportunity, supply, decision, policy, channel: "email", recipient: "rcp_1", now: 1_000_000 });
    expect(first.id).toBe(second.id);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.state).toBe("READY");
    expect(mayRetry(0, first.createdAt, first)).toBe(true);
    expect(mayRetry(2, first.createdAt, first)).toBe(false);
  });

  it("uses a fixed cooldown window for repeat-send identity", () => {
    expect(cooldownWindowStart(169 * 3_600_000, 168)).toBe(168 * 3_600_000);
  });
});
