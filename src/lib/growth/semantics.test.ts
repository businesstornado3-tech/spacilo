import { describe, expect, it } from "vitest";

import { resolveDiscovery } from "@/lib/discovery/resolve";
import { clusterKey, readSemantics } from "./semantics";

describe("growth semantic reading", () => {
  const reading = (text: string) => resolveDiscovery(text).reading;

  it("recognises a moving transition and preserves duration and urgency evidence", () => {
    const result = readSemantics("I am moving next week and need storage for two months", reading("I am moving next week and need storage for two months"));
    expect(result.situationType).toBe("MOVING_TRANSITION");
    expect(result.urgency).toBe("weeks");
    expect(result.duration).toBe("two months");
    expect(result.temporary).toBe(true);
    expect(result.evidence.map((item) => item.field)).toEqual(expect.arrayContaining(["moving_transition", "weeks away", "duration"]));
  });

  it("recognises clearing a family property before completion", () => {
    const text = "Clear parents' house before completion";
    const result = readSemantics(text, reading(text));
    expect(result.situationType).toBe("PROPERTY_TRANSITION");
    expect(result.problem).toContain("cleared");
    expect(result.roles).toContain("PROPERTY_RELATED");
  });

  it("separates unused-space host acquisition from renter capacity", () => {
    const host = readSemantics("I have an unused garage that could earn money", reading("I have an unused garage that could earn money"));
    expect(host.situationType).toBe("HOST_UNDERUSED_SPACE");
    expect(host.roles).toContain("HOST");

    const renter = readSemantics("I have no room for boxes", reading("I have no room for boxes"));
    expect(renter.situationType).toBe("RENTER_CAPACITY");
    expect(renter.roles).toContain("RENTER");
  });

  it("retains an unseen need as uncertain emergent evidence", () => {
    const text = "I need a place for my pottery kiln during a studio renovation";
    const result = readSemantics(text, reading(text));
    expect(result.situationType).toBe("UNCLASSIFIED");
    expect(result.uncertain).toBe(true);
    expect(result.painPoints.some((point) => point.emergent)).toBe(true);
    expect(result.evidence.some((item) => item.field === "raw_signal")).toBe(true);
  });

  it("clusters by underlying situation, audience, segment and location", () => {
    expect(clusterKey({ situationType: "RENTER_CAPACITY", role: "RENTER", segment: "general", locationSlug: "bath" })).toBe("RENTER_CAPACITY|RENTER|general|bath");
    expect(clusterKey({ situationType: "RENTER_CAPACITY", role: "RENTER", segment: "general", locationSlug: null })).toContain("uk_wide");
  });
});
