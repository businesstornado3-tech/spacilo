import { describe, expect, it } from "vitest";

import { DEFAULT_USAGE_LIMITS, checkUsage, estimatedCostPence } from "./usage";

const counts = { videosToday: 0, videosForCampaign: 0, attemptsForAsset: 0 };

describe("generation cost and usage control", () => {
  it("allows generation inside every limit", () => {
    expect(checkUsage(counts, DEFAULT_USAGE_LIMITS).allowed).toBe(true);
  });

  it("stops at the daily limit", () => {
    const decision = checkUsage({ ...counts, videosToday: 6 }, DEFAULT_USAGE_LIMITS);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.state).toBe("LIMIT_REACHED");
  });

  it("stops runaway variants for one campaign and repeats of one asset", () => {
    expect(checkUsage({ ...counts, videosForCampaign: 4 }, DEFAULT_USAGE_LIMITS).allowed).toBe(
      false,
    );
    expect(checkUsage({ ...counts, attemptsForAsset: 3 }, DEFAULT_USAGE_LIMITS).allowed).toBe(
      false,
    );
  });

  it("prices a draft below a final render and reports nothing for an unknown tier", () => {
    expect(estimatedCostPence("360p", 8)!).toBeLessThan(estimatedCostPence("720p", 8)!);
    expect(estimatedCostPence("8k", 8)).toBeNull();
  });
});
