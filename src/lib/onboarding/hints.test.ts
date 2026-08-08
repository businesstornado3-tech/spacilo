import { describe, expect, it } from "vitest";

import {
  ONBOARDING_HINTS,
  isHintDismissed,
  isOnboardingHintId,
  parseDismissed,
  withDismissed,
} from "./hints";

describe("onboarding hints", () => {
  it("keeps every hint to a single short sentence", () => {
    for (const copy of Object.values(ONBOARDING_HINTS)) {
      expect(copy.length).toBeLessThanOrEqual(90);
      expect(copy.split(".").filter((part) => part.trim()).length).toBe(1);
    }
  });

  it("recognises known ids only", () => {
    expect(isOnboardingHintId("planner")).toBe(true);
    expect(isOnboardingHintId("not_a_hint")).toBe(false);
  });

  it("parses stored payloads defensively", () => {
    expect(parseDismissed(null)).toEqual([]);
    expect(parseDismissed("not json")).toEqual([]);
    expect(parseDismissed('{"a":1}')).toEqual([]);
    expect(parseDismissed('["planner","bogus",7]')).toEqual(["planner"]);
  });

  it("never shows a dismissed hint again", () => {
    const first = withDismissed([], "planner");
    expect(isHintDismissed(first, "planner")).toBe(true);
    expect(isHintDismissed(first, "booking")).toBe(false);
    expect(withDismissed(first, "planner")).toEqual(["planner"]);
  });
});
