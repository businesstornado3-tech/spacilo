/**
 * Mock recommendation provider + explainability.
 *
 * Every recommendation is built from the plan that was actually drawn: the
 * placements, the score checks and the measured clearances. A recommendation
 * cannot be created without a reason and the evidence behind it, which is why
 * the contract requires both.
 */
import { buildSuggestions } from "@/lib/spaceplanner/booking-confidence";

import type { PackingResult, Recommendation, RecommendationKind } from "../contracts";
import { buildMeta, throwIfAborted } from "../meta";
import type { ProviderRequest, RecommendationProvider } from "../providers";

const IDENTITY = {
  id: "mock-recommendations-v1",
  label: "EarnRoom AI recommendations",
  model: "spaceplanner-rules-v1",
  remote: false,
} as const;

const KIND_FOR: Record<string, RecommendationKind> = {
  door: "access",
  ceiling: "orientation",
  walkway: "access",
  weight: "safety",
  fit: "capacity",
  fragile: "safety",
};

function kindFor(id: string): RecommendationKind {
  if (id.startsWith("rotate")) return "orientation";
  if (id.startsWith("stack")) return "stacking";
  if (id.startsWith("upright")) return "orientation";
  if (id.startsWith("remove")) return "capacity";
  return "placement";
}

export const mockRecommendationProvider: RecommendationProvider = {
  ...IDENTITY,
  capabilities: ["recommendations"],

  async recommend({ plan, score }: PackingResult, request?: ProviderRequest): Promise<Recommendation[]> {
    throwIfAborted(request?.signal);

    const failing = score.checks.filter((check) => check.state !== "passed");

    const fromChecks: Recommendation[] = failing.map((check) => ({
      id: `check-${check.id}`,
      kind: KIND_FOR[check.id] ?? "placement",
      action: check.label,
      reason: check.detail,
      evidence: [
        `Check "${check.label}" is ${check.state === "failed" ? "not met" : "borderline"}.`,
        `Plan fit is ${score.fitPercent}% of usable volume.`,
      ],
      confidence: check.state === "failed" ? 0.96 : 0.88,
      impact: check.state === "failed" ? "high" : "medium",
    }));

    const fromSuggestions: Recommendation[] = buildSuggestions(plan, score).map((suggestion) => ({
      id: `suggest-${suggestion.id}`,
      kind: kindFor(suggestion.id),
      action: suggestion.label,
      reason: suggestion.detail,
      evidence: [
        suggestion.resolves
          ? `Addresses the ${suggestion.resolves} clearance check.`
          : "Derived from the packed layout.",
        `${plan.itemCount} item${plan.itemCount === 1 ? "" : "s"} planned into ${plan.space.name}.`,
      ],
      confidence: suggestion.kind === "technique" ? 0.93 : 0.85,
      impact: suggestion.kind === "technique" ? "high" : "medium",
    }));

    const fromPlan: Recommendation[] = plan.explanations.map((line, index) => ({
      id: `plan-${index}`,
      kind: "placement",
      action: line,
      reason: "Chosen while packing this exact inventory into this exact space.",
      evidence: [
        `Usable volume ${plan.metrics.usableVolume}m³, required ${plan.metrics.requiredVolume}m³.`,
      ],
      confidence: 0.9,
      impact: "low",
    }));

    const merged = [...fromChecks, ...fromSuggestions, ...fromPlan];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.action)) return false;
      seen.add(item.action);
      return true;
    });
  },
};

/** One line a person can read, used wherever a recommendation is displayed. */
export function explainRecommendation(recommendation: Recommendation): string {
  return `${recommendation.action} — ${recommendation.reason} (${Math.round(
    recommendation.confidence * 100,
  )}% confidence; ${recommendation.evidence.join(" ")})`;
}
