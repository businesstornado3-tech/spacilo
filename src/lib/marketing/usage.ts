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
  { allowed: true } | { allowed: false; reason: string; state: "LIMIT_REACHED" };

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

/** Indicative PAID-provider cost in pence per second, by resolution tier. */
const PENCE_PER_SECOND: Record<string, number> = { "360p": 4, "720p": 12, "1080p": 24 };

export function estimatedCostPence(resolution: string, seconds: number): number | null {
  const rate = PENCE_PER_SECOND[resolution];
  if (rate === undefined) return null;
  return Math.round(rate * seconds);
}

/**
 * Generation cost, split honestly.
 *
 * `apiPence` is what a third party charges EarnRoom for the generation itself.
 * On the self-hosted worker that is genuinely zero. `infrastructurePence` is
 * the compute the founder pays for anyway — it is only ever a number when the
 * founder has told us what their GPU actually costs, and it is never presented
 * as a provider fee.
 */
export type GenerationCost = {
  provider: "SELF_HOSTED" | "PAID_HOSTED";
  apiPence: number;
  apiLabel: string;
  infrastructurePence: number | null;
  infrastructureLabel: string;
};

export function generationCost(input: {
  provider: "SELF_HOSTED" | "PAID_HOSTED";
  resolution: string;
  seconds: number;
  /** GPU-minute price where known; null means unknown, never guessed. */
  infrastructurePencePerGpuMinute?: number | null;
  /** Rough GPU minutes this render will occupy. */
  gpuMinutes?: number | null;
}): GenerationCost {
  if (input.provider === "PAID_HOSTED") {
    const api = estimatedCostPence(input.resolution, input.seconds) ?? 0;
    return {
      provider: "PAID_HOSTED",
      apiPence: api,
      apiLabel: `Estimated provider generation cost £${(api / 100).toFixed(2)}`,
      infrastructurePence: null,
      infrastructureLabel: "Runs on the provider's hardware.",
    };
  }
  const rate = input.infrastructurePencePerGpuMinute ?? null;
  const minutes = input.gpuMinutes ?? null;
  const infrastructurePence = rate !== null && minutes !== null ? Math.round(rate * minutes) : null;
  return {
    provider: "SELF_HOSTED",
    apiPence: 0,
    apiLabel: "Video API cost: £0 per generation",
    infrastructureLabel:
      infrastructurePence === null
        ? "Estimated infrastructure cost: unknown — depends on where the worker runs."
        : `Estimated infrastructure cost £${(infrastructurePence / 100).toFixed(2)} of GPU time`,
    infrastructurePence,
  };
}

/** Rough GPU minutes for a render, from the model's measured throughput. */
export function estimatedGpuMinutes(input: {
  seconds: number;
  secondsPerOutputSecond: number;
  resolution: string;
}): number {
  const scale = input.resolution === "360p" ? 0.4 : input.resolution === "540p" ? 0.7 : 1;
  return Math.max(0.1, (input.seconds * input.secondsPerOutputSecond * scale) / 60);
}
