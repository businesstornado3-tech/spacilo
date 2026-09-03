import { describe, expect, it } from "vitest";

import { resolveDiscovery } from "./resolve";
import { decideIndexation } from "./indexation";
import { scoreOpportunity } from "./scoring";
import { readIntent } from "./intent";
import { planCapabilities } from "./matching";

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
