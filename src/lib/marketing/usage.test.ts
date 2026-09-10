import { describe, expect, it } from "vitest";

import * as usage from "./usage";
import { estimatedCostPence } from "./usage";
import { readWorkerPreferences } from "./workers/settings";

describe("video generation has no daily quota", () => {
  it("exposes no generation quota helper at all", () => {
    // The old "Daily video limit reached (N)" gate is gone for good: manual
    // generation must never be capped by a video counter.
    expect("checkUsage" in usage).toBe(false);
    expect("DEFAULT_USAGE_LIMITS" in usage).toBe(false);
  });

  it("keeps no generation-limit fields in founder worker preferences", () => {
    const prefs = readWorkerPreferences({
      videoWorker: { usage: { maxVideosPerDay: 12 } },
    }) as Record<string, unknown>;
    expect(prefs["usage"]).toBeUndefined();
    // Money caps remain: they are the only real safety on paid generation.
    expect(prefs["spend"]).toBeTruthy();
  });
});

describe("generation cost", () => {
  it("prices a draft below a final render and reports nothing for an unknown tier", () => {
    expect(estimatedCostPence("360p", 8)!).toBeLessThan(estimatedCostPence("720p", 8)!);
    expect(estimatedCostPence("8k", 8)).toBeNull();
  });
});
