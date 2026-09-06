/**
 * Generation cost and usage control.
 *
 * Video generation is expensive, so nothing here is unbounded: every request
 * is checked against founder-configurable daily and per-campaign limits before
 * a provider is contacted.
 *
 * Pure module: the caller supplies the counts it read from the database.
 */
export type UsageLimits = {
  maxVideosPerDay: number;
  maxVariantsPerCampaign: number;
  maxRegenerationsPerAsset: number;
};

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  maxVideosPerDay: 6,
  maxVariantsPerCampaign: 4,
  maxRegenerationsPerAsset: 3,
};

export type UsageCounts = {
  videosToday: number;
  videosForCampaign: number;
  attemptsForAsset: number;
};

export type UsageDecision =
  | { allowed: true }
  | { allowed: false; reason: string; state: "LIMIT_REACHED" };

export function checkUsage(counts: UsageCounts, limits: UsageLimits): UsageDecision {
  if (counts.videosToday >= limits.maxVideosPerDay) {
    return {
      allowed: false,
      state: "LIMIT_REACHED",
      reason: `Daily video limit reached (${limits.maxVideosPerDay}). Raise the limit or wait until tomorrow.`,
    };
  }
  if (counts.videosForCampaign >= limits.maxVariantsPerCampaign) {
    return {
      allowed: false,
      state: "LIMIT_REACHED",
      reason: `This campaign already has ${counts.videosForCampaign} video variants (limit ${limits.maxVariantsPerCampaign}).`,
    };
  }
  if (counts.attemptsForAsset >= limits.maxRegenerationsPerAsset) {
    return {
      allowed: false,
      state: "LIMIT_REACHED",
      reason: `This asset has been regenerated ${counts.attemptsForAsset} times (limit ${limits.maxRegenerationsPerAsset}).`,
    };
  }
  return { allowed: true };
}

/** Indicative cost in pence per second, by resolution tier. Reporting only. */
const PENCE_PER_SECOND: Record<string, number> = { "360p": 4, "720p": 12, "1080p": 24 };

export function estimatedCostPence(resolution: string, seconds: number): number | null {
  const rate = PENCE_PER_SECOND[resolution];
  if (rate === undefined) return null;
  return Math.round(rate * seconds);
}
