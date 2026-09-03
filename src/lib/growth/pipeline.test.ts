import { beforeEach, describe, expect, it } from "vitest";

import { resetGrowthConfig } from "./config";
import { resetConnectors } from "./connectors";
import { buildGrowthPipeline } from "./pipeline";
import type { SourceSignal } from "./types";

const makeSignal = (text: string): SourceSignal => ({ id: `signal:${text}`, connectorId: "first_party", text, observedAt: 1_700_000_000_000, contact: null });

beforeEach(() => {
  resetGrowthConfig();
  resetConnectors();
});

describe("semantic pipeline integration", () => {
  it("retains property-transition evidence for an unseen phrase shape", () => {
    const result = buildGrowthPipeline(makeSignal("Clear parents' house before completion"));
    expect(result.opportunity?.situation.problem).toContain("cleared");
    expect(result.opportunity?.audience.roles).toContain("PROPERTY_RELATED");
    expect(result.opportunity?.situation.temporary).toBe(false);
  });

  it("keeps emergent signals rather than silently dropping them when semantic evidence exists", () => {
    const result = buildGrowthPipeline(makeSignal("I need a place for my pottery kiln during a studio renovation"));
    expect(result.opportunity).not.toBeNull();
    expect(result.opportunity?.painPoints.some((point) => point.emergent)).toBe(true);
  });

  it("keeps first-party analytics contactless and capture-only after policy evaluation", () => {
    const result = buildGrowthPipeline(makeSignal("I am moving next week and need storage"));
    expect(result.signal.contact).toBeNull();
    expect(result.campaign).toBeNull();
    expect(result.opportunity?.decision.value).toBe("CAPTURE_ONLY");
    expect(result.audit.map((event) => event.action)).toContain("policy_evaluated");
  });

  it("uses the same cluster for repeated semantic needs in one location", () => {
    const first = buildGrowthPipeline(makeSignal("I have no room for boxes in Bath"));
    const second = buildGrowthPipeline(makeSignal("There is nowhere to put my belongings in Bath"));
    expect(first.opportunity?.key).toBe(second.opportunity?.key);
  });
});
