import { describe, expect, it } from "vitest";

import {
  buildDataHealth,
  freshness,
  provenanceFor,
  PROVENANCE,
  UNIQUE_VISITORS_PROVENANCE,
} from "./provenance";

const NOW = Date.parse("2026-09-03T12:00:00Z");

describe("data provenance", () => {
  it("documents the unique visitor metric end to end", () => {
    expect(UNIQUE_VISITORS_PROVENANCE.status).toBe("DERIVED_FROM_PRODUCTION");
    expect(UNIQUE_VISITORS_PROVENANCE.source).toContain("analytics_daily_rollups");
    expect(UNIQUE_VISITORS_PROVENANCE.calculation).toContain("distinct");
    expect(UNIQUE_VISITORS_PROVENANCE.timezone).toContain("Europe/London");
    expect(UNIQUE_VISITORS_PROVENANCE.caveats?.join(" ")).toContain("not a distinct person");
    expect(UNIQUE_VISITORS_PROVENANCE.exclusions.join(" ")).toContain("bots");
  });

  it("gives every documented metric a source and a calculation", () => {
    for (const entry of PROVENANCE) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.calculation.length).toBeGreaterThan(0);
      expect(entry.exclusions.length).toBeGreaterThan(0);
    }
  });

  it("labels campaign sends as mock so they can never read as delivery", () => {
    const sends = provenanceFor("campaign_sends");
    expect(sends?.status).toBe("MOCK");
    expect(sends?.caveats?.join(" ")).toContain("Delivery is only claimed");
  });

  it("labels an AI score as a score, not as performance", () => {
    expect(provenanceFor("growth_opportunity_score")?.caveats?.join(" ")).toContain(
      "not performance",
    );
  });

  it("reports freshness states, and unavailable rather than a guess", () => {
    expect(freshness(null, NOW)).toBe("UNAVAILABLE");
    expect(freshness(NOW - 10 * 60_000, NOW)).toBe("LIVE");
    expect(freshness(NOW - 4 * 3_600_000, NOW)).toBe("RECENT");
    expect(freshness(NOW - 30 * 3_600_000, NOW)).toBe("STALE");
  });
});

describe("data health", () => {
  const base = {
    lastEventAt: NOW - 5 * 60_000,
    lastRollupAt: NOW - 2 * 3_600_000,
    lastOpportunityAt: NOW - 3 * 3_600_000,
    conversionEvents: 2,
    geographyPlaces: 4,
    mockCampaignAttempts: 6,
    liveCampaignAttempts: 0,
    failedCampaignAttempts: 0,
    now: NOW,
  };

  it("passes when every stream is fresh and mocks are isolated", () => {
    const checks = buildDataHealth(base);
    expect(checks.every((check) => check.state === "OK")).toBe(true);
    expect(checks.find((c) => c.id === "mock_isolation")?.detail).toContain("Nothing was transmitted");
  });

  it("flags missing conversions instead of inventing one", () => {
    const checks = buildDataHealth({ ...base, conversionEvents: 0 });
    const conversions = checks.find((check) => check.id === "conversions");
    expect(conversions?.state).toBe("ATTENTION");
    expect(conversions?.detail).toContain("no conversion is claimed");
  });

  it("flags stale ingestion and missing rollups", () => {
    const checks = buildDataHealth({ ...base, lastEventAt: NOW - 200 * 3_600_000, lastRollupAt: null });
    expect(checks.find((check) => check.id === "event_ingestion")?.state).toBe("ATTENTION");
    expect(checks.find((check) => check.id === "rollups")?.state).toBe("UNAVAILABLE");
  });

  it("surfaces failed campaign jobs", () => {
    const checks = buildDataHealth({ ...base, failedCampaignAttempts: 3 });
    expect(checks.find((check) => check.id === "campaign_jobs")?.state).toBe("ATTENTION");
  });
});
