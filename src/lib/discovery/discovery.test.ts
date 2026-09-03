import { describe, expect, it } from "vitest";

import { resolveDiscovery } from "./resolve";
import { decideIndexation } from "./indexation";
import { scoreOpportunity } from "./scoring";
import { readIntent } from "./intent";
import { planCapabilities } from "./matching";

const HARDENING_CASES = [
  ["what can I do with my empty room?", "underused_space", "prospective_host", "none", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["make better use of my warehouse", "commercial_space_optimisation", "prospective_host", "none", "space_scanner", "/guides/business-stock-storage", "INDEX", "/tools/spaceplanner"],
  ["too much stock for my shop", "business_overflow", "renter", "none", "location_search", "/guides/business-stock-storage", "INDEX", "/tools/location-search"],
  ["student storage Bristol", "transition", "renter", "place", "location_search", "/storage/bristol", "NOINDEX", "/tools/location-search"],
  ["earn side income", "monetisation_unknown", "prospective_host", "none", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["earn passive income", "monetisation_unknown", "prospective_host", "none", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["make money from unused space", "underused_space", "prospective_host", "none", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["make money from my garage", "underused_space", "prospective_host", "none", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["storage Oxford", "none", "renter", "place", "location_search", "/storage/oxford", "NOINDEX", "/tools/location-search"],
  ["storage near me", "none", "renter", "near_me", "location_search", "/search", "NOINDEX", "/tools/location-search"],
  ["make money from my garage in Leeds", "underused_space", "prospective_host", "place", "space_estimate", "/guides/earn-from-unused-space", "INDEX", "/tools/space-estimate"],
  ["store business equipment", "none", "renter", "none", "location_search", "/guides/business-stock-storage", "INDEX", "/tools/location-search"],
] as const;

describe("discovery safety", () => {
  it("routes a multi-dimensional query to a factual destination", () => {
    const result = resolveDiscovery("storage near Manchester for furniture while moving");
    expect(result.destination).toBeTruthy();
    expect(result.reading.location.kind).toBe("place");
    expect(result.explanation.join(" ")).not.toContain("Manchester");
  });

  it("keeps supply claims noindex when there is no real supply", () => {
    const reading = readIntent("storage in Manchester");
    const plan = planCapabilities(reading);
    const score = scoreOpportunity({ reading, plan });
    expect(decideIndexation({ hasDedicatedPage: true, hasReviewedContent: true, claimsSupply: true, publishedSpaces: 0, exposesPrivateData: false, score }).status).toBe("NOINDEX");
  });

  it.each(HARDENING_CASES)("resolves %s with a safe product path", (query, problem, role, location, capability, destination, indexability, conversion) => {
    const result = resolveDiscovery(query);
    if (problem !== "none") expect(result.reading.problems.map((item) => item.value)).toContain(problem);
    expect(result.reading.role).toBe(role);
    expect(result.reading.location.kind).toBe(location);
    expect(result.plan.primary?.id).toBe(capability);
    expect(result.destination).toBe(destination);
    expect(result.indexation.status).toBe(indexability);
    expect(result.links.some((link) => link.to === conversion)).toBe(true);

    const renterLocation = role === "renter" && location !== "none";
    if (renterLocation) {
      expect(result.indexation.reasons).toContain("supply_claim_without_supply");
    } else {
      expect(result.indexation.reasons).not.toContain("supply_claim_without_supply");
    }
  });

  it("routes a named renter location to the canonical storage experience", () => {
    expect(resolveDiscovery("storage Oxford").destination).toBe("/storage/oxford");
    expect(resolveDiscovery("storage near me").destination).toBe("/search");
  });

  it("keeps host location acquisition independent from renter supply", () => {
    const result = resolveDiscovery("make money from my garage in Leeds");
    expect(result.reading.role).toBe("prospective_host");
    expect(result.indexation.status).not.toBe("NOINDEX");
  });
});
