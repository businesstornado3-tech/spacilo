/**
 * Cost transparency for one generation.
 *
 * Two facts are kept strictly apart:
 *   - what a third party actually charged (only ever known when a provider
 *     confirms it), and
 *   - EarnRoom's own internal estimate.
 *
 * An internal estimate can never be displayed as a confirmed provider charge.
 * £0 is only claimed where no third party runs the compute at all.
 */
import { estimatedCostPence } from "../usage";
import type { WorkerMode } from "./types";

export type CostSource =
  /** No third party is involved: browser or the founder's own machine. */
  | "NO_THIRD_PARTY"
  /** EarnRoom's own arithmetic, before or without provider confirmation. */
  | "INTERNAL_ESTIMATE"
  /** The provider reported the charge for this generation. */
  | "PROVIDER_CONFIRMED"
  /** A third party ran it but has not told us the price. */
  | "NOT_CONFIRMED";

export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  NO_THIRD_PARTY: "No third-party video-generation cost",
  INTERNAL_ESTIMATE: "EarnRoom estimate — not a confirmed provider charge",
  PROVIDER_CONFIRMED: "Confirmed by the provider",
  NOT_CONFIRMED: "Provider cost: not confirmed",
};

export type CostReport = {
  mode: WorkerMode;
  provider: string | null;
  /** Third-party generation cost in pence. Null when it is genuinely unknown. */
  pence: number | null;
  source: CostSource;
  currency: "GBP";
  /** One line for the console. Never overstates what is known. */
  line: string;
  /** True only where a real charge can arise. */
  chargeable: boolean;
  /** Internal infrastructure estimate, kept separate from any provider fee. */
  infrastructurePence: number | null;
  infrastructureLine: string;
};

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function costReport(input: {
  mode: WorkerMode;
  provider?: string | null;
  resolution: string;
  seconds: number;
  /** Provider-reported charge for this generation, when one was returned. */
  confirmedPence?: number | null;
  /** Founder-supplied price of their own compute. */
  infrastructurePencePerGpuMinute?: number | null;
  gpuMinutes?: number | null;
}): CostReport {
  const rate = input.infrastructurePencePerGpuMinute ?? null;
  const minutes = input.gpuMinutes ?? null;
  const infrastructurePence = rate !== null && minutes !== null ? Math.round(rate * minutes) : null;
  const infrastructureLine =
    input.mode === "BROWSER"
      ? "Runs on this computer — no EarnRoom compute used."
      : infrastructurePence === null
        ? "Infrastructure cost: unknown — depends on where the worker runs."
        : `Estimated infrastructure cost ${pounds(infrastructurePence)} of computing time.`;

  const base = {
    mode: input.mode,
    provider: input.provider ?? null,
    currency: "GBP" as const,
    infrastructurePence,
    infrastructureLine,
  };

  if (input.mode === "BROWSER" || input.mode === "LOCAL") {
    return {
      ...base,
      pence: 0,
      source: "NO_THIRD_PARTY",
      chargeable: false,
      line: "Third-party video-generation cost: £0",
    };
  }

  if (input.mode === "FREE_CLOUD") {
    // £0 is only claimed while the provider's free allowance actually covers it.
    return {
      ...base,
      pence: 0,
      source: "INTERNAL_ESTIMATE",
      chargeable: false,
      line: "Third-party video-generation cost: £0 while the provider's free allowance lasts",
    };
  }

  if (typeof input.confirmedPence === "number") {
    return {
      ...base,
      pence: input.confirmedPence,
      source: "PROVIDER_CONFIRMED",
      chargeable: true,
      line: `Provider charge ${pounds(input.confirmedPence)} — confirmed by the provider`,
    };
  }

  const estimate = estimatedCostPence(input.resolution, input.seconds);
  if (estimate === null) {
    return {
      ...base,
      pence: null,
      source: "NOT_CONFIRMED",
      chargeable: true,
      line: "Provider cost: not confirmed",
    };
  }
  return {
    ...base,
    pence: estimate,
    source: "INTERNAL_ESTIMATE",
    chargeable: true,
    line: `Estimated provider cost ${pounds(estimate)} — EarnRoom estimate, not a confirmed charge`,
  };
}

/** Spending caps. All of them must pass before a paid generation may run. */
export type SpendCaps = {
  perVideoPence: number;
  perDayPence: number;
  perCampaignPence: number;
  perMonthPence: number;
};

export const DEFAULT_SPEND_CAPS: SpendCaps = {
  perVideoPence: 200,
  perDayPence: 500,
  perCampaignPence: 500,
  perMonthPence: 5000,
};

export type SpendCounts = {
  spentTodayPence: number;
  spentThisCampaignPence: number;
  spentThisMonthPence: number;
};

export type SpendDecision = { allowed: true } | { allowed: false; reason: string };

export function checkSpend(
  cost: CostReport,
  counts: SpendCounts,
  caps: SpendCaps,
): SpendDecision {
  if (!cost.chargeable) return { allowed: true };
  const amount = cost.pence;
  if (amount === null) {
    return {
      allowed: false,
      reason: "The provider has not confirmed a price for this generation, so it cannot be run.",
    };
  }
  if (amount > caps.perVideoPence) {
    return {
      allowed: false,
      reason: `This video would cost ${pounds(amount)}, above the ${pounds(caps.perVideoPence)} limit for a single video.`,
    };
  }
  if (counts.spentTodayPence + amount > caps.perDayPence) {
    return {
      allowed: false,
      reason: `This would take today's paid spend past the ${pounds(caps.perDayPence)} daily limit.`,
    };
  }
  if (counts.spentThisCampaignPence + amount > caps.perCampaignPence) {
    return {
      allowed: false,
      reason: `This would take the campaign past its ${pounds(caps.perCampaignPence)} limit.`,
    };
  }
  if (counts.spentThisMonthPence + amount > caps.perMonthPence) {
    return {
      allowed: false,
      reason: `This would take the month past its ${pounds(caps.perMonthPence)} limit.`,
    };
  }
  return { allowed: true };
}
