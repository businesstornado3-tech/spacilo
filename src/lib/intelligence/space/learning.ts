/**
 * Milestone 17 — learning preparation.
 *
 * Infrastructure only: no machine learning, no model, no training. Signals are
 * anonymous by construction — a signal cannot carry a user id, a postcode or
 * free text, because the contract has nowhere to put them.
 */
import type { ZoneKind } from "./contracts";

export type SpaceLearningOutcome =
  | "layout_accepted"
  | "layout_rejected"
  | "zone_preferred"
  | "host_adjusted"
  | "booking_won"
  | "booking_lost";

export interface SpaceLearningSignal {
  outcome: SpaceLearningOutcome;
  /** Space type only — never a space id, an address or a person. */
  spaceKind: string;
  zone?: ZoneKind;
  /** Non-identifying magnitude of a correction, e.g. metres or percent. */
  delta?: number;
  at: number;
}

export interface SpaceLearningSummary {
  signals: number;
  acceptanceRate: number;
  /** Zone kinds hosts kept most often, most preferred first. */
  preferredZones: ZoneKind[];
  /** Confidence multiplier the engine may apply, clamped to a safe band. */
  calibration: number;
  byOutcome: Record<SpaceLearningOutcome, number>;
}

const EMPTY_OUTCOMES: Record<SpaceLearningOutcome, number> = {
  layout_accepted: 0,
  layout_rejected: 0,
  zone_preferred: 0,
  host_adjusted: 0,
  booking_won: 0,
  booking_lost: 0,
};

let signals: SpaceLearningSignal[] = [];

/** Keeps memory bounded; the platform never needs deep history in the client. */
const MAX_SIGNALS = 500;

export function recordSpaceSignal(signal: Omit<SpaceLearningSignal, "at"> & { at?: number }): void {
  const entry: SpaceLearningSignal = {
    outcome: signal.outcome,
    spaceKind: signal.spaceKind,
    ...(signal.zone ? { zone: signal.zone } : {}),
    ...(typeof signal.delta === "number" ? { delta: signal.delta } : {}),
    at: signal.at ?? Date.now(),
  };
  signals = [...signals.slice(-(MAX_SIGNALS - 1)), entry];
}

export function summariseSpaceLearning(): SpaceLearningSummary {
  const byOutcome = { ...EMPTY_OUTCOMES };
  const zoneCounts = new Map<ZoneKind, number>();

  for (const signal of signals) {
    byOutcome[signal.outcome] += 1;
    if (signal.zone) zoneCounts.set(signal.zone, (zoneCounts.get(signal.zone) ?? 0) + 1);
  }

  const decided = byOutcome.layout_accepted + byOutcome.layout_rejected;
  const acceptanceRate = decided === 0 ? 0 : Math.round((byOutcome.layout_accepted / decided) * 100) / 100;

  const preferredZones = [...zoneCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([zone]) => zone);

  // Calibration stays deliberately narrow: infrastructure must not be able to
  // swing a displayed confidence on its own.
  const calibration =
    decided === 0 ? 1 : Math.round(Math.min(1.1, Math.max(0.9, 0.9 + acceptanceRate * 0.2)) * 100) / 100;

  return { signals: signals.length, acceptanceRate, preferredZones, calibration, byOutcome };
}

export function resetSpaceLearning(): void {
  signals = [];
}
