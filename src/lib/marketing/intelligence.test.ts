import { describe, expect, it } from "vitest";

import { seoOpportunities, SEO_TOPICS, seasonalWeight } from "./seo-intelligence";
import { demandCreationOpportunities } from "./demand-creation";
import { geographyOpportunities, growthOpportunityMarketing } from "./market-intelligence";
import type { GeographyPlace } from "@/lib/admin/geography";

const place = (over: Partial<GeographyPlace>): GeographyPlace => ({
  slug: "portsmouth",
  name: "Portsmouth",
  kind: "city",
  demandVisitors: 10,
  demandEvents: 40,
  storageRequests: 2,
  bookings: 1,
  publishedSpaces: 0,
  supplyState: "NO_SUPPLY",
  opportunityScore: 88,
  trend: "RISING",
  trendPercent: 25,
  plot: null,
  point: null,
  priority: "HIGH",
  ...over,
});

describe("SEO intelligence", () => {
  it("produces opportunities with no marketplace demand at all", () => {
    const results = seoOpportunities({ month: 6 });
    expect(results.length).toBe(SEO_TOPICS.length);
    expect(results.every((item) => item.evidenceClass === "SEO_OPPORTUNITY")).toBe(true);
  });

  it("lifts in-season topics and damps recently covered ones", () => {
    const topic = SEO_TOPICS.find((item) => item.id === "student-storage")!;
    expect(seasonalWeight(topic, 6)).toBeGreaterThan(seasonalWeight(topic, 12));
    const fresh = seoOpportunities({ month: 6 }).find(
      (item) => item.key === "seo:student-storage",
    )!;
    const tired = seoOpportunities({ month: 6, recentTopicIds: ["student-storage"] }).find(
      (item) => item.key === "seo:student-storage",
    )!;
    expect(tired.strength).toBeLessThan(fresh.strength);
  });
});

describe("demand creation intelligence", () => {
  it("never labels a created opportunity as observed market demand", () => {
    const results = demandCreationOpportunities();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.evidenceClass === "DEMAND_CREATION_OPPORTUNITY")).toBe(
      true,
    );
    expect(
      results.every((item) => item.rationale.includes("No EarnRoom demand signal is claimed")),
    ).toBe(true);
  });
});

describe("market intelligence adapter", () => {
  it("treats demand without supply as a host-acquisition supply gap", () => {
    const [opportunity] = geographyOpportunities([place({})]);
    expect(opportunity?.trigger).toBe("SUPPLY_GAP");
    expect(opportunity?.objective).toBe("HOST_ACQUISITION");
    expect(opportunity?.evidenceClass).toBe("REAL_MARKET_DEMAND");
    expect(opportunity?.evidence.some((item) => item.value === 40)).toBe(true);
  });

  it("never invents demand for a place with no signal", () => {
    expect(geographyOpportunities([place({ demandEvents: 0, demandVisitors: 0 })])).toHaveLength(0);
  });

  it("carries growth-engine evidence through unchanged", () => {
    const [opportunity] = growthOpportunityMarketing([
      {
        key: "opp_1",
        problem: "No room for boxes",
        audience: "HOST",
        locationSlug: "bath",
        locationName: "Bath",
        frequency: 3,
        score: 70,
      },
    ]);
    expect(opportunity?.trigger).toBe("USER_PAIN_POINT");
    expect(opportunity?.audience).toBe("hosts");
    expect(opportunity?.rationale).toContain("3 time(s)");
  });
});
