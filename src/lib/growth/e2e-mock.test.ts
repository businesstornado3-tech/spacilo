/**
 * Phase 11 final readiness — one end-to-end autonomous scenario, run entirely
 * against the mock connector/adapter path.
 *
 * SOURCE SIGNAL → SITUATION → PAIN POINT → AUDIENCE → LOCATION → FIT →
 * SCORE → DECISION → POLICY GATE → MESSAGE → QUEUE → MOCK SEND →
 * RESPONSE → CONVERSION → LEARNING.
 *
 * Nothing here transmits to a person: the enabled channel is the in-product
 * surface and every adapter is a non-transmitting mock.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { attributionRecord, landingAttribution, learningSignalFromAttribution } from "./attribution";
import { buildCampaign } from "./campaign";
import { registerChannel, resetChannels } from "./channels";
import { defaultAutonomyConfig, resetGrowthConfig, setGrowthConfig } from "./config";
import { resetConnectors } from "./connectors";
import { executeCampaign, resetAdapters } from "./delivery";
import { rankOpportunities, totalsByOpportunity } from "./learning";
import { buildGrowthPipeline } from "./pipeline";
import { evaluatePolicy, decideCampaign } from "./policy";
import type { GrowthLearningSignal, SourceSignal } from "./types";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

function signal(patch: Partial<SourceSignal> = {}): SourceSignal {
  return {
    id: "analytics:e2e",
    connectorId: "first_party",
    text: "moving in three weeks, sofa bed and boxes, new place delayed",
    observedAt: NOW,
    occurrences: 4,
    contact: null,
    ...patch,
  };
}

/** Enables the in-product channel + campaign engine, still never transmitting. */
function enableInternalAutonomy() {
  const base = defaultAutonomyConfig();
  setGrowthConfig({ flags: { ...base.flags, AI_AUTONOMOUS_SEND_ENABLED: true } });
  registerChannel({
    id: "earnroom_internal",
    label: "In-product surface",
    enabled: true,
    requiresConsent: false,
    acceptsLegitimateInterest: true,
    perRecipientPerDay: 1,
    cooldownHours: 24,
    requiresSenderIdentity: false,
  });
}

beforeEach(() => {
  resetGrowthConfig();
  resetChannels();
  resetConnectors();
  resetAdapters();
});

describe("Phase 11 end-to-end mock scenario", () => {
  it("carries one signal from understanding to a learning signal without a human step", async () => {
    enableInternalAutonomy();
    const pipeline = buildGrowthPipeline(signal(), NOW);
    const opportunity = pipeline.opportunity;
    expect(opportunity).not.toBeNull();
    expect(opportunity!.situation.summary.length).toBeGreaterThan(0);
    expect(opportunity!.audience.primary).toBeTruthy();
    expect(opportunity!.scores.opportunity).toBeGreaterThan(0);

    const policy = evaluatePolicy({
      opportunity: opportunity!,
      channel: "earnroom_internal",
      consent: "none",
      hasContact: true,
      recentSends24h: 0,
      hoursSinceLastContact: null,
      suppressed: false,
      now: NOW,
    });
    expect(policy.verdict).toBe("ALLOW");

    const decision = decideCampaign(opportunity!, policy, NOW);
    expect(decision.value).toBe("CAMPAIGN_NOW");

    const campaign = buildCampaign({
      opportunity: opportunity!,
      supply: opportunity!.supply,
      decision,
      policy,
      channel: "earnroom_internal",
      recipient: "rcpt_hash_abc",
      now: NOW,
    });
    expect(campaign.state).toBe("QUEUED");
    expect(campaign.message).not.toBeNull();

    const first = await executeCampaign(campaign, {
      recipient: "rcpt_hash_abc",
      attempts: 0,
      holdsLock: true,
      now: NOW,
    });
    expect(first.executed).toBe(true);
    expect(first.state).toBe("SENT");
    expect(first.outcome.providerReference).toBeNull();
    expect(first.learning[0]?.outcome).toBe("sent");

    // Response + conversion arrive as attribution, then become learning.
    const landing = landingAttribution({ path: "/search", params: { utm_campaign: "growth" }, now: NOW });
    const record = attributionRecord({
      eventId: "evt_1",
      eventName: "booking_confirmed",
      occurredAt: NOW + 3600_000,
      path: "/renter/bookings",
      opportunityKey: opportunity!.key,
      campaignId: campaign.id,
      landing,
      props: { channel: "earnroom_internal", value_pence: 5600 },
    });
    expect(record).not.toBeNull();
    const learning = learningSignalFromAttribution(record!);
    expect(learning?.outcome).toBe("converted");

    const signals: GrowthLearningSignal[] = [first.learning[0]!, learning!];
    const totals = totalsByOpportunity(signals);
    const ranked = rankOpportunities([opportunity!], totals);
    expect(ranked[0]?.key).toBe(opportunity!.key);
  });

  it("is idempotent: a repeated send refuses and a repeated attribution key is stable", async () => {
    enableInternalAutonomy();
    const opportunity = buildGrowthPipeline(signal(), NOW).opportunity!;
    const policy = evaluatePolicy({
      opportunity,
      channel: "earnroom_internal",
      consent: "none",
      hasContact: true,
      recentSends24h: 0,
      hoursSinceLastContact: null,
      suppressed: false,
      now: NOW,
    });
    const decision = decideCampaign(opportunity, policy, NOW);
    const input = {
      opportunity,
      supply: opportunity.supply,
      decision,
      policy,
      channel: "earnroom_internal" as const,
      recipient: "rcpt_hash_abc",
      now: NOW,
    };
    // Same opportunity + channel + recipient inside the cooldown window ⇒ one id.
    expect(buildCampaign(input).id).toBe(buildCampaign({ ...input, now: NOW + 60_000 }).id);

    const campaign = buildCampaign(input);
    const sent = await executeCampaign(campaign, { recipient: "rcpt_hash_abc", attempts: 0, holdsLock: true, now: NOW });
    expect(sent.executed).toBe(true);
    const repeat = await executeCampaign(
      { ...campaign, state: "SENT", sentAt: NOW },
      { recipient: "rcpt_hash_abc", attempts: 1, holdsLock: true, now: NOW + 1000 },
    );
    expect(repeat.executed).toBe(false);
    expect(repeat.outcome.status).toBe("skipped");

    const event = {
      eventId: "evt_1",
      eventName: "booking_confirmed" as const,
      occurredAt: NOW,
      path: "/renter/bookings",
      opportunityKey: opportunity.key,
      campaignId: campaign.id,
      landing: landingAttribution({ path: "/search", now: NOW }),
      props: {},
    };
    expect(attributionRecord(event)!.idempotencyKey).toBe(attributionRecord(event)!.idempotencyKey);
  });

  it("blocks automatically — opt-out, emergency stop and disabled channel need no human", async () => {
    enableInternalAutonomy();
    const opportunity = buildGrowthPipeline(signal(), NOW).opportunity!;
    const base = {
      opportunity,
      channel: "earnroom_internal" as const,
      consent: "none" as const,
      hasContact: true,
      recentSends24h: 0,
      hoursSinceLastContact: null,
      suppressed: false,
      now: NOW,
    };
    expect(evaluatePolicy({ ...base, suppressed: true }).verdict).toBe("BLOCK");
    expect(evaluatePolicy({ ...base, recentSends24h: 5 }).verdict).toBe("DEFER");
    expect(evaluatePolicy({ ...base, channel: "sms" }).verdict).toBe("DEFER");
    setGrowthConfig({ emergencyStop: true });
    expect(evaluatePolicy(base).verdict).toBe("BLOCK");
  });

  it("keeps the message grounded in evidence and invents nothing", () => {
    enableInternalAutonomy();
    const opportunity = buildGrowthPipeline(signal(), NOW).opportunity!;
    const policy = evaluatePolicy({
      opportunity,
      channel: "earnroom_internal",
      consent: "none",
      hasContact: true,
      recentSends24h: 0,
      hoursSinceLastContact: null,
      suppressed: false,
      now: NOW,
    });
    const campaign = buildCampaign({
      opportunity,
      supply: opportunity.supply,
      decision: decideCampaign(opportunity, policy, NOW),
      policy,
      channel: "earnroom_internal",
      recipient: "rcpt_hash_abc",
      now: NOW,
    });
    const body = campaign.message!.body;
    expect(campaign.message!.claims.length).toBeGreaterThan(0);
    // No availability claim while there is no supply.
    expect(opportunity.supply.mayClaimAvailability).toBe(false);
    expect(body).toMatch(/cannot promise availability|could be earning|free to start/i);
    expect(body).not.toMatch(/£\d|\bguarantee|\d+ boxes|your family|your address/i);
  });

  it("retains a no-supply renter opportunity and a no-renter host opportunity", () => {
    const renter = buildGrowthPipeline(signal({ id: "s1", text: "storage oxford" }), NOW).opportunity;
    expect(renter).not.toBeNull();
    expect(renter!.supply.mayClaimAvailability).toBe(false);
    expect(renter!.supply.ctaMode).toBe("capture_demand");

    const host = buildGrowthPipeline(
      signal({ id: "s2", text: "make money from my garage in leeds" }),
      NOW,
    ).opportunity;
    expect(host).not.toBeNull();
    expect(host!.audience.primary).toBe("HOST");
  });

  it("understands unseen problem statements rather than matching fixed keywords", () => {
    const phrases = [
      "moving house and my new place isn't ready",
      "need somewhere for furniture while selling my house",
      "too much stock for my shop",
      "empty garage, how can I earn from it?",
      "student leaving bristol for summer",
      "clearing my parents' house before completion",
      "what can I do with my unused room?",
      "how can I make better use of my warehouse?",
    ];
    for (const [index, text] of phrases.entries()) {
      const result = buildGrowthPipeline(signal({ id: `p${index}`, text }), NOW);
      expect(result.opportunity, text).not.toBeNull();
      expect(result.opportunity!.evidence.length, text).toBeGreaterThan(0);
    }
  });
});
