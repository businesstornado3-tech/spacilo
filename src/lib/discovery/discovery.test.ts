import { describe, expect, it } from "vitest";

import { resolveDiscovery } from "./resolve";
import { decideIndexation } from "./indexation";
import { scoreOpportunity } from "./scoring";
import { readIntent } from "./intent";
import { planCapabilities } from "./matching";

const HARDENING_CASES = [
  ["what can I do with my empty room?", "underused_space", "prospective_host", "space_estimate"],
  ["make better use of my warehouse", "commercial_space_optimisation", "prospective_host", "space_scanner"],
  ["too much stock for my shop", "business_overflow", "renter", "location_search"],
  ["student storage Bristol", "transition", "renter", "location_search"],
  ["earn side income", "monetisation_unknown", "prospective_host", "space_estimate"],
  ["earn passive income", "monetisation_unknown", "prospective_host", "space_estimate"],
  ["make money from unused space", "underused_space", "prospective_host", "space_estimate"],
  ["make money from my garage", "underused_space", "prospective_host", "space_estimate"],
  ["storage Oxford", "none", "renter", "location_search"],
  ["storage near me", "none", "renter", "location_search"],
  ["make money from my garage in Leeds", "underused_space", "prospective_host", "space_estimate"],
  ["store business equipment", "none", "renter", "location_search"],
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
});
