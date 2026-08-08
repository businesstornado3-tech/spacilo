/**
 * Mock learning provider.
 *
 * Records whether people kept or corrected what Spacilo AI proposed, and turns
 * that into a calibration multiplier. It stores counts against non-identifying
 * subject keys only — no photos, no free text, no user ids — and is capped so
 * feedback can nudge confidence but never manufacture it.
 */
import type { LearningSignal, LearningSummary } from "../contracts";
import { buildMeta } from "../meta";
import type { LearningProvider } from "../providers";

const IDENTITY = {
  id: "mock-learning-v1",
  label: "Spacilo AI learning (in-memory)",
  model: "calibration-v1",
  remote: false,
} as const;

interface Tally {
  accepted: number;
  corrected: number;
  rejected: number;
}

const tallies = new Map<string, Tally>();

/** Calibration is deliberately narrow: ±10% at most. */
const MIN_CALIBRATION = 0.9;
const MAX_CALIBRATION = 1.1;

export const mockLearningProvider: LearningProvider = {
  ...IDENTITY,
  capabilities: ["learning"],

  record(signal: LearningSignal): void {
    const key = `${signal.capability}:${signal.subject}`;
    const tally = tallies.get(key) ?? { accepted: 0, corrected: 0, rejected: 0 };
    tally[signal.outcome] += 1;
    tallies.set(key, tally);
  },

  summarise(): LearningSummary {
    const startedAt = Date.now();
    let accepted = 0;
    let total = 0;
    for (const tally of tallies.values()) {
      accepted += tally.accepted;
      total += tally.accepted + tally.corrected + tally.rejected;
    }
    const acceptanceRate = total === 0 ? 0 : accepted / total;
    const calibration =
      total === 0
        ? 1
        : Math.min(MAX_CALIBRATION, Math.max(MIN_CALIBRATION, 0.9 + acceptanceRate * 0.2));

    return {
      signals: total,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      calibration: Math.round(calibration * 100) / 100,
      meta: buildMeta(IDENTITY, startedAt),
    };
  },
};

/** Test helper — forgets everything learned. */
export function resetLearning(): void {
  tallies.clear();
}
