/**
 * Founder video-worker preferences.
 *
 * Stored inside the existing `marketing_settings` jsonb blob — no new settings
 * table. Paid compute is OFF by default and can only ever be turned on by an
 * explicit founder action.
 */
import { DEFAULT_SPEND_CAPS, type SpendCaps } from "./cost";
import type { WorkerPreference } from "./types";

export type WorkerPreferences = {
  defaultWorker: WorkerPreference;
  paidComputeEnabled: boolean;
  autonomousGeneration: boolean;
  autonomousPublishing: boolean;
  /** Emergency switches. Either one stops work immediately. */
  generationPaused: boolean;
  publishingPaused: boolean;
  spend: SpendCaps;
};

export const DEFAULT_WORKER_PREFERENCES: WorkerPreferences = {
  defaultWorker: "AUTO",
  paidComputeEnabled: false,
  autonomousGeneration: false,
  autonomousPublishing: false,
  generationPaused: false,
  publishingPaused: false,
  spend: DEFAULT_SPEND_CAPS,
};

const PREFERENCES: readonly WorkerPreference[] = [
  "AUTO",
  "BROWSER",
  "LOCAL",
  "FREE_CLOUD",
  "PAID_CLOUD",
];

function bounded(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.round(parsed), max);
}

/** Reads preferences out of the settings blob, defaulting anything missing. */
export function readWorkerPreferences(settings: unknown): WorkerPreferences {
  const record = (settings ?? {}) as Record<string, unknown>;
  const raw = (record["videoWorker"] ?? {}) as Record<string, unknown>;
  const usage = (raw["usage"] ?? {}) as Record<string, unknown>;
  const spend = (raw["spend"] ?? {}) as Record<string, unknown>;
  const preference = raw["defaultWorker"];

  const paidComputeEnabled = raw["paidComputeEnabled"] === true;
  const requested = PREFERENCES.includes(preference as WorkerPreference)
    ? (preference as WorkerPreference)
    : "AUTO";

  return {
    // Selecting the paid worker while paid compute is off would be meaningless,
    // so the pair is never allowed to disagree in the spending direction.
    defaultWorker: requested === "PAID_CLOUD" && !paidComputeEnabled ? "AUTO" : requested,
    paidComputeEnabled,
    autonomousGeneration: raw["autonomousGeneration"] === true,
    autonomousPublishing: raw["autonomousPublishing"] === true,
    generationPaused: raw["generationPaused"] === true,
    publishingPaused: raw["publishingPaused"] === true,
    spend: {
      perVideoPence: bounded(spend["perVideoPence"], DEFAULT_SPEND_CAPS.perVideoPence, 20_000),
      perDayPence: bounded(spend["perDayPence"], DEFAULT_SPEND_CAPS.perDayPence, 100_000),
      perCampaignPence: bounded(
        spend["perCampaignPence"],
        DEFAULT_SPEND_CAPS.perCampaignPence,
        100_000,
      ),
      perMonthPence: bounded(spend["perMonthPence"], DEFAULT_SPEND_CAPS.perMonthPence, 500_000),
    },
  };
}

export type WorkerPreferencePatch = Partial<{
  defaultWorker: WorkerPreference;
  paidComputeEnabled: boolean;
  autonomousGeneration: boolean;
  autonomousPublishing: boolean;
  generationPaused: boolean;
  publishingPaused: boolean;
  spend: Partial<SpendCaps>;
}>;

/** Applies a patch, re-reading through the same guards. */
export function applyWorkerPreferences(
  current: WorkerPreferences,
  patch: WorkerPreferencePatch,
): WorkerPreferences {
  const merged = {
    ...current,
    ...patch,
    spend: { ...current.spend, ...(patch.spend ?? {}) },
  };
  // Turning paid compute off must also drop a paid default, never leave it armed.
  return readWorkerPreferences({ videoWorker: merged });
}
