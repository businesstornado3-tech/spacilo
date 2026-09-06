import { describe, expect, it } from "vitest";

import { validateContent } from "./validation";
import { planDailyCampaign } from "./orchestrator";
import { defaultMarketingSettings } from "./platforms";
import type { ContentHistoryEntry } from "./coverage";

const NOW = Date.parse("2026-06-15T09:00:00Z");
const settings = defaultMarketingSettings();
const plan = planDailyCampaign({ now: NOW, settings, places: [], growth: [], history: [], insights: [], existingIds: [] });

const run = (over: Parameters<typeof validateContent>[0] extends infer T ? Partial<T> : never = {}) =>
  validateContent({
    opportunity: plan.campaign.opportunity,
    story: plan.campaign.story,
    assets: plan.campaign.assets,
    history: [],
    now: NOW,
    publishedToday: 0,
    maxDailyPublications: settings.maxDailyPublications,
    ...over,
  });

describe("content validation", () => {
  it("passes generated content and records every check", () => {
    const result = run();
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBeGreaterThan(6);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("blocks forbidden safety claims", () => {
    const story = { ...plan.campaign.story, renterCta: "Your things are 100% safe with us." };
    const result = run({ story });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("100% safe");
  });

  it("blocks availability claims that the opportunity cannot support", () => {
    const opportunity = { ...plan.campaign.opportunity, mayClaimAvailability: false };
    const story = { ...plan.campaign.story, renterCta: "Spaces available near you today." };
    const result = run({ opportunity, story });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("availability");
  });

  it("blocks invented statistics", () => {
    const story = { ...plan.campaign.story, renterCta: "Over 10,000 people use EarnRoom." };
    expect(run({ story }).passed).toBe(false);
  });

  it("blocks non-UK conventions", () => {
    const story = { ...plan.campaign.story, renterCta: "Rent a 100 sq ft unit for $50 a month." };
    const result = run({ story });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("UK");
  });

  it("blocks near-duplicate content published in the recent window", () => {
    const history: ContentHistoryEntry[] = [
      {
        campaignId: "ER-CAMP-2026-000009",
        planDate: "2026-06-14",
        opportunityKey: plan.campaign.opportunity.key,
        topic: plan.campaign.opportunity.topic,
        locationSlug: plan.campaign.opportunity.location?.slug ?? null,
        audience: plan.campaign.opportunity.audience,
        trigger: plan.campaign.opportunity.trigger,
        hook: plan.campaign.story.hook,
        publishedAt: NOW - 3_600_000,
      },
    ];
    const result = run({ history });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("Same opportunity already ran");
  });

  it("enforces the daily publication cap", () => {
    const result = run({ publishedToday: settings.maxDailyPublications });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("Daily publication limit");
  });
});
