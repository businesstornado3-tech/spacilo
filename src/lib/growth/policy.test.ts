import { beforeEach, describe, expect, it } from "vitest";

import { defaultAutonomyConfig, resetGrowthConfig, setGrowthConfig } from "./config";
import { resetChannels, registerChannel } from "./channels";
import { resetConnectors } from "./connectors";
import { decideCampaign, evaluatePolicy } from "./policy";
import type { GrowthOpportunity } from "./types";

function opportunity(): GrowthOpportunity {
  return {
    key: "opp_policy",
    signalId: "signal_policy",
    connectorId: "first_party",
    situation: { summary: "Need space", achieving: null, problem: "capacity", cause: null, need: "storage", likelyNext: null, urgency: "unknown", belongings: [], spaces: [], temporary: null, residentialOrBusiness: "residential", location: { label: null, slug: null, kind: "none" }, confidence: 0.9, evidence: [], reading: {} as GrowthOpportunity["situation"]["reading"] },
    painPoints: [],
    audience: { roles: ["RENTER"], primary: "RENTER", segment: "general", discoveryRole: "renter", confidence: 0.9, evidence: [] },
    fit: { verdict: "BEST_EXISTING_SOLUTION", capabilities: [], destination: null, reasons: [], confidence: 0.9 },
    supply: { level: "LEVEL_1_NO_SUPPLY", publishedSpaces: 0, ctaMode: "capture_demand", mayClaimAvailability: false, reasons: [] },
    scores: { opportunity: 80, campaignEligibility: 80, conversionLikelihood: 50, sourceConfidence: 0.9, intentConfidence: 0.9, band: "high", factors: [] },
    decision: { value: "CAPTURE_ONLY", reasons: [] },
    status: "ACTIONABLE",
    firstSeen: 1,
    latestSeen: 1,
    frequency: 1,
    evidence: [],
  };
}

beforeEach(() => {
  resetGrowthConfig();
  resetChannels();
  resetConnectors();
});

describe("growth policy gates", () => {
  it("fails closed when there is no lawful contact or usable channel", () => {
    const result = evaluatePolicy({ opportunity: opportunity(), channel: null, consent: "none", hasContact: false, recentSends24h: 0, hoursSinceLastContact: null, suppressed: false, now: 1 });
    expect(result.verdict).toBe("DEFER");
    expect(result.checks.find((check) => check.id === "contact_available")?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "consent_basis")?.passed).toBe(false);
    expect(decideCampaign(opportunity(), result, 1).value).toBe("CAPTURE_ONLY");
  });

  it("blocks an explicit opt-out even if all other configuration is enabled", () => {
    setGrowthConfig({ flags: { ...defaultAutonomyConfig().flags, AI_AUTONOMOUS_SEND_ENABLED: true } });
    registerChannel({ id: "email", label: "Email", enabled: true, requiresConsent: true, acceptsLegitimateInterest: true, perRecipientPerDay: 1, cooldownHours: 168, requiresSenderIdentity: true, deliveryMode: "live", credentialState: "verified", termsStatus: "authorised" });
    const result = evaluatePolicy({ opportunity: opportunity(), channel: "email", consent: "withdrawn", hasContact: true, recentSends24h: 0, hoursSinceLastContact: null, suppressed: true, now: 1 });
    expect(result.verdict).toBe("BLOCK");
    expect(decideCampaign(opportunity(), result, 1).value).toBe("DO_NOT_CAMPAIGN");
  });

  it("keeps frequency and cooldown as independent gates", () => {
    setGrowthConfig({ flags: { ...defaultAutonomyConfig().flags, AI_AUTONOMOUS_SEND_ENABLED: true } });
    registerChannel({ id: "email", label: "Email", enabled: true, requiresConsent: true, acceptsLegitimateInterest: true, perRecipientPerDay: 1, cooldownHours: 168, requiresSenderIdentity: true, deliveryMode: "live", credentialState: "verified", termsStatus: "authorised" });
    const result = evaluatePolicy({ opportunity: opportunity(), channel: "email", consent: "granted", hasContact: true, recentSends24h: 1, hoursSinceLastContact: 2, suppressed: false, now: 1 });
    expect(result.checks.find((check) => check.id === "frequency_cap")?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "cooldown")?.passed).toBe(false);
  });
});
