import { describe, expect, it } from "vitest";

import {
  demandCreationOutcome,
  learningInsights,
  normalisePerformance,
  performanceIndex,
} from "./performance";
import type { ContentHistoryEntry } from "./coverage";
import type { PerformanceRecord } from "./types";

const NOW = Date.parse("2026-06-15T09:00:00Z");

const record = (over: Partial<PerformanceRecord> = {}): PerformanceRecord => ({
  ...normalisePerformance({
    campaignId: "ER-CAMP-2026-000001",
    assetId: "asset-1",
    platform: "youtube_shorts",
    collectedAt: NOW,
    raw: { views: 1000, likes: 50, comments: 10, shares: 5, average_view_percentage: 62 },
    conversions: { registrations: 4, bookings: 1 },
  }),
  ...over,
});

const history: ContentHistoryEntry[] = [
  {
    campaignId: "ER-CAMP-2026-000001",
    planDate: "2026-06-14",
    opportunityKey: "seo:student-storage",
    topic: "Student storage",
    locationSlug: "bath",
    audience: "students",
    trigger: "SEASONAL",
    hook: "Term is over.",
    publishedAt: NOW - 86_400_000,
  },
];

describe("performance normalisation", () => {
  it("maps platform-specific keys without inventing missing metrics", () => {
    const normalised = normalisePerformance({
      campaignId: "c",
      assetId: "a",
      platform: "instagram",
      collectedAt: NOW,
      raw: { reach: 500, link_clicks: 12 },
    });
    expect(normalised.metrics.impressions).toBe(500);
    expect(normalised.metrics.clicks).toBe(12);
    expect(normalised.metrics.views).toBeNull();
    expect(normalised.metrics.saves).toBeNull();
    expect(normalised.platformSpecific["reach"]).toBe(500);
  });

  it("normalises a percentage completion rate to a fraction", () => {
    expect(record().metrics.completionRate).toBeCloseTo(0.62, 5);
  });

  it("returns no index when the platform reported no reach", () => {
    expect(
      performanceIndex(
        record({ metrics: { ...record().metrics, views: null, impressions: null } }),
      ),
    ).toBeNull();
  });
});

describe("learning loop", () => {
  it("only reports a dimension once it has enough observations", () => {
    const single = learningInsights({ records: [record()], history });
    expect(single).toHaveLength(0);
    const repeated = learningInsights({
      records: [record(), record({ assetId: "asset-2" })],
      history,
    });
    expect(
      repeated.some(
        (insight) => insight.dimension === "topic" && insight.value === "Student storage",
      ),
    ).toBe(true);
    expect(repeated.every((insight) => insight.note.includes("recommendations only"))).toBe(true);
  });

  it("reports measured demand creation and stays silent when nothing was measured", () => {
    expect(demandCreationOutcome([record()]).measured).toBe(true);
    const blank = record({
      conversions: {
        siteVisits: null,
        registrations: null,
        hostRegistrations: null,
        renterRegistrations: null,
        enquiries: null,
        listings: null,
        bookings: null,
      },
    });
    expect(demandCreationOutcome([blank]).measured).toBe(false);
    expect(demandCreationOutcome([blank]).bookings).toBeNull();
  });
});
