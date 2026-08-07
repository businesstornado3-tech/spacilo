/**
 * Milestone 8 — AI decision cards.
 *
 * A card is the smallest complete unit of advice: what we recommend, how sure
 * we are, why, what could go wrong, what to do, and what you get for it.
 */
import type {
  DecisionCard,
  DecisionRisk,
  ExplainedRecommendation,
  ListingAssessment,
  SmartSuggestion,
} from "./contracts";

function riskFromScore(value: number): DecisionRisk {
  if (value >= 85) return "low";
  if (value >= 68) return "medium";
  return "high";
}

/** The headline card for a listing: book, check, or move on. */
export function fitDecisionCard(assessment: ListingAssessment): DecisionCard {
  const { score, analysis, listing } = assessment;
  const risk = riskFromScore(score.value);
  return {
    id: `fit-${listing.id}`,
    title: `${listing.title} — overall fit`,
    recommendation: score.recommendation,
    confidence: assessment.confidence,
    reason: `${score.band} at about ${score.fitPercent}% of the usable volume.`,
    evidence: [
      `Usable volume about ${analysis.usable.availableVolumeM3.toFixed(1)}m³.`,
      `${assessment.floorClearPercent}% of the floor stays clear.`,
      `Access is ${analysis.access.access} through a ${analysis.access.doorWidthM.toFixed(2)}m opening.`,
      `About ${assessment.remainingVolumeM3.toFixed(1)}m³ would remain spare.`,
    ],
    risk,
    action:
      risk === "low"
        ? "Send a booking request"
        : risk === "medium"
          ? "Message the host to confirm the tight measurements"
          : "Compare a larger space before committing",
    expectedBenefit:
      risk === "low"
        ? "A pack that fits first time, with room to reach everything."
        : "Fewer surprises on handover day.",
  };
}

export function cardFromRecommendation(entry: ExplainedRecommendation): DecisionCard {
  return {
    id: `rec-${entry.id}`,
    title: entry.action,
    recommendation: entry.action,
    confidence: entry.confidence,
    reason: entry.reason,
    evidence: entry.evidence,
    risk: entry.impact === "high" ? "medium" : "low",
    action: entry.action,
    expectedBenefit: `${entry.tradeOff} Alternative: ${entry.alternative}`,
  };
}

export function cardFromSuggestion(entry: SmartSuggestion): DecisionCard {
  return {
    id: `sug-${entry.id}`,
    title: entry.title,
    recommendation: entry.detail,
    confidence: entry.confidence,
    reason: entry.detail,
    evidence: entry.evidence,
    risk: "low",
    action: entry.title,
    expectedBenefit:
      entry.volumeSavedM3 > 0
        ? `Frees about ${entry.volumeSavedM3.toFixed(1)}m³.`
        : "Makes the pack easier to live with.",
  };
}

/** The three cards a surface should show first, highest impact first. */
export function buildDecisionCards(
  assessment: ListingAssessment,
  recommendations: ExplainedRecommendation[],
  suggestions: SmartSuggestion[],
  limit = 4,
): DecisionCard[] {
  const cards = [
    fitDecisionCard(assessment),
    ...recommendations.filter((entry) => entry.impact === "high").map(cardFromRecommendation),
    ...suggestions.filter((entry) => entry.impact === "high").map(cardFromSuggestion),
  ];
  const seen = new Set<string>();
  return cards.filter((card) => !seen.has(card.id) && seen.add(card.id)).slice(0, limit);
}
