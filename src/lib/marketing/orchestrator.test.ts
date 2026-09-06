import { describe, expect, it } from "vitest";

import { planDailyCampaign, type PlanInput } from "./orchestrator";
import { defaultMarketingSettings } from "./platforms";
import type { ContentHistoryEntry } from "./coverage";
import type { GeographyPlace } from "@/lib/admin/geography";

const NOW = Date.parse("2026-06-15T09:00:00Z");

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  now: NOW,
  settings: defaultMarketingSettings(),
  places: [],
  growth: [],
  history: [],
  insights: [],
  existingIds: [],
  ...over,
});

const portsmouth: GeographyPlace = {
  slug: "portsmouth",
  name: "Portsmouth",
  kind: "city",
  demandVisitors: 22,
  demandEvents: 120,
  storageRequests: 3,
  bookings: 1,
  publishedSpaces: 0,
  supplyState: "NO_SUPPLY",
  opportunityScore: 92,
  trend: "RISING",
  trendPercent: 40,
  plot: null,
  point: null,
  priority: "HIGH",
};

describe("daily marketing orchestrator", () => {
  it("still selects a meaningful campaign when there is no marketplace demand", () => {
    const plan = planDailyCampaign(base());
    expect(plan.campaign.id).toMatch(/^ER-CAMP-2026-\d{6}$/);
    expect(["SEO", "DEMAND_CREATION"]).toContain(plan.source);
    expect(plan.campaign.opportunity.evidenceClass).not.toBe("REAL_MARKET_DEMAND");
    expect(plan.campaign.story.scenes.length).toBeGreaterThan(3);
    expect(plan.campaign.assets.length).toBeGreaterThan(2);
  });

  it("prefers real market demand when it exists and keeps its evidence", () => {
    const plan = planDailyCampaign(base({ places: [portsmouth] }));
    expect(plan.source).toBe("MARKET");
    expect(plan.campaign.opportunity.location?.slug).toBe("portsmouth");
    expect(plan.campaign.opportunity.evidence.some((item) => item.value === 120)).toBe(true);
    expect(plan.campaign.score.reason.length).toBeGreaterThan(10);
  });

  it("rotates the angle rather than repeating yesterday's campaign", () => {
    const history: ContentHistoryEntry[] = [
      {
        campaignId: "ER-CAMP-2026-000001",
        planDate: "2026-06-14",
        opportunityKey: "market:supply-gap:portsmouth",
        topic: "Local host supply",
        locationSlug: "portsmouth",
        audience: "hosts",
        trigger: "SUPPLY_GAP",
        hook: "Got a spare garage in Portsmouth?",
        publishedAt: NOW - 86_400_000,
      },
    ];
    const plan = planDailyCampaign(base({ places: [portsmouth], history, existingIds: ["ER-CAMP-2026-000001"] }));
    expect(plan.campaign.opportunity.key).not.toBe("market:supply-gap:portsmouth");
    expect(plan.campaign.id).toBe("ER-CAMP-2026-000002");
  });

  it("queues nothing for publication while approval is required", () => {
    const plan = planDailyCampaign(base({ places: [portsmouth] }));
    expect(plan.campaign.status).toBe("AWAITING_APPROVAL");
    expect(plan.campaign.assets.every((asset) => asset.state === "APPROVAL_REQUIRED")).toBe(true);
    expect(plan.campaign.assets.every((asset) => asset.videoUrl === null)).toBe(true);
  });

  it("pauses assets instead of queueing them when publishing is paused", () => {
    const settings = { ...defaultMarketingSettings(), globalMode: "AUTONOMOUS" as const, pauseAllPublishing: true };
    const plan = planDailyCampaign(base({ places: [portsmouth], settings }));
    expect(plan.campaign.assets.every((asset) => asset.state === "PAUSED")).toBe(true);
  });

  it("gives every platform its own native hook and format", () => {
    const plan = planDailyCampaign(base({ places: [portsmouth] }));
    const hooks = new Set(plan.campaign.assets.map((asset) => asset.hook));
    expect(hooks.size).toBeGreaterThan(1);
    for (const asset of plan.campaign.assets) {
      expect(asset.hashtags.length).toBeGreaterThan(0);
      expect(asset.description).toContain("earnroom.co.uk");
    }
  });
});
