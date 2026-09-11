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

/**
 * Who asked for this generation.
 *
 * MANUAL — the founder pressed Generate and confirmed the exact cost. It is
 * authorised individually, so no daily budget applies to it, ever.
 * AUTONOMOUS — EarnRoom started it by itself. Only these spend against the
 * founder-set autonomous daily budget.
 */
export type GenerationInitiator = "MANUAL" | "AUTONOMOUS";

/** Spending controls. Only autonomous generation has a budget. */
export type SpendCaps = {
  /** Daily budget for AUTONOMOUS generations only, in pence. */
  autonomousDailyPence: number;
};

/** The most expensive paid preset the founder can actually choose, in pence. */
export const MOST_EXPENSIVE_PAID_PENCE = 720;

/** Founder presets for the autonomous daily budget, in pence. */
export const AUTONOMOUS_BUDGET_PRESETS: readonly number[] = [720, 2000, 5000, 10_000];

/** Upper bound on what may be stored, so a typo cannot commit a fortune. */
export const MAX_AUTONOMOUS_DAILY_PENCE = 100_000;

export const DEFAULT_SPEND_CAPS: SpendCaps = {
  autonomousDailyPence: MOST_EXPENSIVE_PAID_PENCE,
};

export type SpendCounts = {
  /** Founder-initiated paid spend today. Reporting only — never a limit. */
  manualSpentTodayPence: number;
  /** Autonomous paid spend today. This is what the budget measures. */
  autonomousSpentTodayPence: number;
};

export type SpendDecision = { allowed: true } | { allowed: false; reason: string };

/** Pence of autonomous budget still available today. Never negative. */
export function autonomousRemainingPence(counts: SpendCounts, caps: SpendCaps): number {
  return Math.max(0, caps.autonomousDailyPence - counts.autonomousSpentTodayPence);
}

export function checkSpend(
  cost: CostReport,
  counts: SpendCounts,
  caps: SpendCaps,
  initiator: GenerationInitiator = "MANUAL",
): SpendDecision {
  if (!cost.chargeable) return { allowed: true };
  const amount = cost.pence;
  if (amount === null) {
    return {
      allowed: false,
      reason: "The provider has not confirmed a price for this generation, so it cannot be run.",
    };
  }
  // A founder-initiated video is authorised by its own cost confirmation.
  // No daily, campaign or monthly cap may ever stand in its way.
  if (initiator === "MANUAL") return { allowed: true };

  const remaining = autonomousRemainingPence(counts, caps);
  if (amount > remaining) {
    return {
      allowed: false,
      reason: `Automatic video making has ${pounds(remaining)} left of its ${pounds(caps.autonomousDailyPence)} daily budget, and this video would cost ${pounds(amount)}. You can still make this video yourself.`,
    };
  }
  return { allowed: true };
}

