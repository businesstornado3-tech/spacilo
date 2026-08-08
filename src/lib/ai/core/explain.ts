/**
 * Explainable AI framework.
 *
 * Every decision the platform makes can be explained in the same shape, so a
 * future user-facing "why" panel needs no per-feature work.
 */
import type { AiAlternative, AiExplanation, AiExplanationFactor } from "./types";

export function factor(label: string, detail: string, weight = 0.5): AiExplanationFactor {
  return { label, detail, weight: clamp(weight, -1, 1) };
}

export function alternative(label: string, reason: string, confidence = 0.5): AiAlternative {
  return { label, reason, confidence: clamp(confidence, 0, 1) };
}

export function explain(input: {
  reason: string;
  confidence: number;
  factors?: AiExplanationFactor[];
  alternatives?: AiAlternative[];
}): AiExplanation {
  return {
    reason: input.reason,
    confidence: clamp(input.confidence, 0, 1),
    factors: input.factors ?? [],
    alternatives: (input.alternatives ?? []).sort((a, b) => b.confidence - a.confidence),
  };
}

/** One-line summary suitable for a tooltip or a log. */
export function summariseExplanation(explanation: AiExplanation): string {
  const top = [...explanation.factors].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))[0];
  const percent = Math.round(explanation.confidence * 100);
  return top ? `${explanation.reason} (${top.label}, ${percent}% confident)` : `${explanation.reason} (${percent}% confident)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
