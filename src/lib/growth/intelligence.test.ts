import { describe, expect, it, beforeEach } from "vitest";

import { resolveDiscovery } from "@/lib/discovery/resolve";
import { analyseOpportunity, mergeIntelligence, type IntelligenceInput } from "./intelligence";
import { readSemantics } from "./semantics";
import { resetChannels, registerChannel, channelMayAct, channelMayTransmit } from "./channels";
import { resetConnectors } from "./connectors";
import { resetGrowthConfig, setGrowthConfig } from "./config";
import { buildGrowthPipeline } from "./pipeline";
import type { SupplyContext } from "./types";

const NO_SUPPLY: SupplyContext = {
  level: "LEVEL_1_NO_SUPPLY",
  publishedSpaces: 0,
  ctaMode: "capture_demand",
  mayClaimAvailability: false,
  reasons: [],
};

function analyse(text: string, overrides: Partial<IntelligenceInput> = {}) {
  const resolution = resolveDiscovery(text);
  return analyseOpportunity({
    text,
    reading: resolution.reading,
    semantics: readSemantics(text, resolution.reading),
    supply: NO_SUPPLY,
    now: 1_700_000_000_000,
    ...overrides,
  });
}

beforeEach(() => {
  resetGrowthConfig();
  resetChannels();
  resetConnectors();
});

describe("deep opportunity intelligence — mandatory scenarios", () => {
  it("reads a moving household with urgency, duration and relocation intent", () => {
    const result = analyse("I am moving house next week and need storage for two months in Bristol");
    expect(result.intents.value).toContain("MANAGE_RELOCATION");
    expect(result.urgency.value).toBe("HIGH");
    expect(result.duration.value).toBe("MEDIUM_TERM");
    expect(result.cluster).toBe("RELOCATION_STORAGE");
    expect(result.location.city).toBe("Bristol");
    expect(result.location.country).toBe("United Kingdom");
    expect(result.goal.value).toContain("house move");
  });

  it("reads an unused garage as host monetisation, not renter demand", () => {
    const result = analyse("I have an unused garage doing nothing and want to earn money from it");
    expect(result.audiences.value).toContain("HOST");
    expect(result.intents.value).toContain("MONETISE_SPACE");
    expect(result.cluster).toBe("UNUSED_SPACE_MONETISATION");
  });

  it("reads business stock overflow", () => {
    const result = analyse("Our ecommerce business has too much stock for the shop stockroom");
    expect(result.audiences.value).toContain("BUSINESS");
    expect(result.intents.value).toContain("MANAGE_BUSINESS_INVENTORY");
    expect(result.cluster).toBe("BUSINESS_INVENTORY_OVERFLOW");
  });

  it("reads a student leaving Bristol for the summer", () => {
    const result = analyse("student leaving university halls in Bristol for the summer, need storage");
    expect(result.audiences.value).toContain("STUDENT");
    expect(result.cluster).toBe("STUDENT_SHORT_TERM_STORAGE");
    expect(result.context.value).toContain("academic_calendar");
  });

  it("reads clearing a parents' house before completion", () => {
    const result = analyse("clearing my parents' house before completion next week");
    expect(result.cluster).toBe("PROPERTY_TRANSITION_STORAGE");
    expect(result.intents.value).toContain("MANAGE_PROPERTY_TRANSITION");
    expect(result.urgency.value).toBe("HIGH");
  });

  it("keeps an unrecognised need as an emerging need instead of discarding it", () => {
    const result = analyse("somewhere for my pottery kiln during a studio renovation");
    expect(result.emergingNeed).not.toBeNull();
    expect(result.emergingNeed?.rawSignal).toContain("pottery kiln");
    expect(result.context.value).toContain("renovation");
  });

  it("never invents a location, urgency or duration that was not stated", () => {
    const result = analyse("need somewhere to store boxes");
    expect(result.location.city).toBeNull();
    expect(result.location.country).toBeNull();
    expect(result.location.origin).toBeNull();
    expect(result.urgency.value).toBe("UNKNOWN");
    expect(result.duration.value).toBe("UNKNOWN");
  });

  it("records origin and destination when the person states a journey", () => {
    const result = analyse("moving from bristol to leeds and need space in between");
    expect(result.location.origin).toBe("bristol");
    expect(result.location.destination).toBe("leeds");
    expect(result.location.multiLocation).toBe(true);
  });

  it("treats no supply as an opportunity, never as a reason to claim availability", () => {
    const result = analyse("need storage in portsmouth this week");
    expect(result.fit.verdict).not.toBe("NOT_A_FIT");
    expect(result.fit.reasoning.join(" ")).toContain("No availability may be claimed");
  });

  it("gives every dimension its own confidence and evidence", () => {
    const result = analyse("moving next week, need storage for a month in Bath");
    for (const dimension of [result.urgency, result.duration, result.intents]) {
      expect(dimension.confidence).toBeGreaterThan(0);
      expect(dimension.evidence.length).toBeGreaterThan(0);
    }
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("has no campaign potential without a lawful contact handle", () => {
    const result = analyse("need storage in bath tomorrow");
    expect(result.campaignPotential).toBe("LOW");
    expect(result.campaignReason).toContain("contact handle");
  });

  it("synthesises repeat signals without creating duplicates", () => {
    const first = analyse("need storage");
    const second = analyse("moving next week and need storage in Bath for a month");
    const merged = mergeIntelligence(first, second);
    expect(merged.urgency.value).toBe("HIGH");
    expect(merged.intents.value).toContain("MANAGE_RELOCATION");
    expect(new Set(merged.intents.value).size).toBe(merged.intents.value.length);
  });
});

describe("channel authorisation is the outbound gate", () => {
  it("blocks transmission on a channel with no verified credentials", () => {
    expect(channelMayTransmit("email")).toBe(false);
    expect(channelMayAct("email")).toBe(false);
  });

  it("permits the in-product surface to act but never to transmit", () => {
    expect(channelMayAct("earnroom_internal")).toBe(true);
    expect(channelMayTransmit("earnroom_internal")).toBe(false);
  });

  it("permits transmission only when the channel is fully authorised", () => {
    registerChannel({
      id: "email",
      label: "Email",
      enabled: true,
      requiresConsent: true,
      acceptsLegitimateInterest: true,
      perRecipientPerDay: 1,
      cooldownHours: 168,
      requiresSenderIdentity: true,
      deliveryMode: "live",
      credentialState: "verified",
      termsStatus: "authorised",
    });
    expect(channelMayTransmit("email")).toBe(true);
    setGrowthConfig({ emergencyStop: true });
    expect(channelMayTransmit("email")).toBe(false);
  });
});

describe("pipeline carries the deep reading", () => {
  it("attaches intelligence to an accepted opportunity and stays idempotent", () => {
    const signal = {
      id: "sig-1",
      connectorId: "first_party",
      text: "moving house next month and need storage in Bath",
      observedAt: 1_700_000_000_000,
    };
    const a = buildGrowthPipeline(signal);
    const b = buildGrowthPipeline(signal);
    expect(a.opportunity?.intelligence?.cluster).toBe("RELOCATION_STORAGE");
    expect(a.opportunity?.key).toBe(b.opportunity?.key);
    expect(a.audit.map((event) => event.id)).toEqual(b.audit.map((event) => event.id));
  });
});
