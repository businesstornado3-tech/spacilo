import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCampaign } from "./campaign";
import {
  executeCampaign,
  getAdapter,
  mockAdapter,
  registerAdapter,
  resetAdapters,
  realOutboundAvailable,
} from "./delivery";
import { resetGrowthConfig, setGrowthConfig } from "./config";
import type { Campaign, GrowthOpportunity } from "./types";

const opportunity = {
  key: "opp_delivery",
  audience: { primary: "RENTER", roles: ["RENTER"], segment: "general", discoveryRole: "renter", confidence: 0.8, evidence: [] },
  situation: { summary: "A renter needs storage", achieving: null, problem: "capacity", cause: null, need: "storage", likelyNext: null, urgency: "unknown", belongings: [], spaces: [], temporary: null, residentialOrBusiness: "residential", location: { label: "Bath", slug: "bath", kind: "place" }, confidence: 0.8, evidence: [], reading: {} },
  fit: { verdict: "BEST_EXISTING_SOLUTION", capabilities: [], destination: null, reasons: [], confidence: 0.8 },
  scores: { opportunity: 70, campaignEligibility: 70, conversionLikelihood: 40, sourceConfidence: 0.8, intentConfidence: 0.8, band: "strong", factors: [] },
  supply: { level: "LEVEL_2_SOME_SUPPLY", publishedSpaces: 1, ctaMode: "surface_matches", mayClaimAvailability: true, reasons: [] },
  painPoints: [], signalId: "signal_delivery", connectorId: "first_party", decision: { value: "CAMPAIGN_NOW", reasons: [] }, status: "ACTIONABLE", firstSeen: 1, latestSeen: 1, frequency: 1, evidence: [{ quote: "storage", field: "need" }],
} as unknown as GrowthOpportunity;

function queuedCampaign(): Campaign {
  return buildCampaign({
    opportunity,
    supply: opportunity.supply,
    decision: { value: "CAMPAIGN_NOW", reasons: [] },
    policy: { verdict: "ALLOW", checks: [], reasons: [], requiresConfiguration: false },
    channel: "earnroom_internal",
    recipient: "rcp_delivery",
    now: 1_000_000,
  });
}

describe("campaign delivery safety boundary", () => {
  beforeEach(() => {
    resetGrowthConfig();
    resetAdapters();
  });

  it("executes the mock path without transmitting when outbound is disabled", async () => {
    const campaign = queuedCampaign();
    const result = await executeCampaign(campaign, {
      attempts: 0,
      recipient: "rcp_delivery",
      holdsLock: true,
      now: 1_000_001,
    });

    expect(result.executed).toBe(true);
    expect(result.outcome.status).toBe("sent");
    expect(result.outcome.providerReference).toBeNull();
    expect(result.state).toBe("SENT");
    expect(result.learning[0]?.outcome).toBe("sent");
    expect(result.audit[0]?.detail).toMatchObject({ adapter_mode: "mock", transmitted: false });
    expect(realOutboundAvailable("earnroom_internal")).toBe(false);
  });

  it("refuses execution without the exclusive send lock", async () => {
    const result = await executeCampaign(queuedCampaign(), {
      attempts: 0,
      recipient: "rcp_delivery",
      holdsLock: false,
      now: 1_000_001,
    });

    expect(result.executed).toBe(false);
    expect(result.outcome.status).toBe("skipped");
    expect(result.outcome.detail).toContain("lock");
  });

  it("refuses a second attempt after the campaign is already sent", async () => {
    const campaign = { ...queuedCampaign(), state: "SENT" as const, sentAt: 1_000_001 };
    const result = await executeCampaign(campaign, {
      attempts: 1,
      recipient: "rcp_delivery",
      holdsLock: true,
      now: 1_000_002,
    });

    expect(result.executed).toBe(false);
    expect(result.outcome.status).toBe("skipped");
    expect(result.attemptNumber).toBe(2);
  });

  it("never calls a transmitting adapter while the global send switch is off", async () => {
    const send = vi.fn(async () => ({ status: "sent" as const, providerReference: "provider", detail: "should not run" }));
    registerAdapter({ channel: "email", mode: "live", transmits: true, send });
    const campaign = { ...queuedCampaign(), channel: "email" as const };
    const result = await executeCampaign(campaign, {
      attempts: 0,
      recipient: "rcp_delivery",
      holdsLock: true,
      now: 1_000_001,
    });

    expect(result.executed).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(result.outcome.detail).toContain("disabled");
    expect(getAdapter("email")?.mode).toBe("live");
    expect(realOutboundAvailable("email")).toBe(false);
  });

  it("refuses a campaign that has no recipient reference", async () => {
    const result = await executeCampaign(queuedCampaign(), {
      attempts: 0,
      recipient: null,
      holdsLock: true,
      now: 1_000_001,
    });

    expect(result.executed).toBe(false);
    expect(result.outcome.detail).toContain("recipient");
  });

  it("limits failed adapter attempts and never labels them sent", async () => {
    registerAdapter({
      channel: "earnroom_internal",
      mode: "mock",
      transmits: false,
      send: async () => ({ status: "failed", providerReference: null, detail: "mock failure" }),
    });

    const result = await executeCampaign(queuedCampaign(), {
      attempts: 1,
      recipient: "rcp_delivery",
      holdsLock: true,
      now: 1_000_001,
    });

    expect(result.executed).toBe(false);
    expect(result.outcome.status).toBe("failed");
    expect(result.state).toBe("EXPIRED");
  });
});
