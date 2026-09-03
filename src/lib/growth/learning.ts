/**
 * Phase 11 Stage 7 — attribution, learning and innovation recommendations.
 *
 * Learning here is deliberately conservative: outcomes adjust *ranking*, never
 * the policy gates, so a run of good results can never talk the engine into
 * contacting someone it is not allowed to contact. Everything it concludes is
 * an internal recommendation for a human to act on.
 */
import type {
  GrowthInsight,
  GrowthLearningSignal,
  GrowthOpportunity,
  InsightKind,
} from "./types";

export type OutcomeTotals = {
  sent: number;
  clicked: number;
  responded: number;
  registered: number;
  converted: number;
  noResponse: number;
  blocked: number;
  valuePence: number;
};

export function emptyTotals(): OutcomeTotals {
  return { sent: 0, clicked: 0, responded: 0, registered: 0, converted: 0, noResponse: 0, blocked: 0, valuePence: 0 };
}

/** Aggregates raw learning signals into per-opportunity outcome totals. */
export function totalsByOpportunity(
  signals: readonly GrowthLearningSignal[],
): Map<string, OutcomeTotals> {
  const out = new Map<string, OutcomeTotals>();
  for (const signal of signals) {
    const totals = out.get(signal.opportunityKey) ?? emptyTotals();
    switch (signal.outcome) {
      case "sent":
        totals.sent += 1;
        break;
      case "clicked":
        totals.clicked += 1;
        break;
      case "responded":
        totals.responded += 1;
        break;
      case "registered":
        totals.registered += 1;
        break;
      case "converted":
        totals.converted += 1;
        totals.valuePence += signal.valuePence ?? 0;
        break;
      case "blocked":
        totals.blocked += 1;
        break;
      default:
        totals.noResponse += 1;
    }
    out.set(signal.opportunityKey, totals);
  }
  return out;
}

/** Response rate, or null when nothing was ever sent — never a fabricated 0%. */
export function responseRate(totals: OutcomeTotals): number | null {
  if (totals.sent === 0) return null;
  return Math.round(((totals.responded + totals.registered + totals.converted) / totals.sent) * 100) / 100;
}

/**
 * Re-ranks opportunities using observed outcomes. The adjustment is bounded to
 * ±15 points so evidence tilts priority without overwhelming the underlying
 * assessment or letting one lucky conversion dominate.
 */
export function rankOpportunities(
  opportunities: readonly GrowthOpportunity[],
  outcomes: Map<string, OutcomeTotals>,
): Array<GrowthOpportunity & { learnedScore: number }> {
  return opportunities
    .map((opportunity) => {
      const totals = outcomes.get(opportunity.key);
      let adjustment = 0;
      if (totals) {
        const rate = responseRate(totals);
        if (rate !== null) adjustment += Math.round((rate - 0.1) * 40);
        if (totals.converted > 0) adjustment += 8;
        if (totals.blocked > 0) adjustment -= 10;
      }
      const bounded = Math.max(-15, Math.min(15, adjustment));
      const learnedScore = Math.max(0, Math.min(100, opportunity.scores.opportunity + bounded));
      return { ...opportunity, learnedScore };
    })
    .sort((a, b) => b.learnedScore - a.learnedScore || b.frequency - a.frequency);
}

export type InnovationRecommendation = {
  opportunityKey: string;
  kind: InsightKind;
  title: string;
  problem: string;
  audience: string;
  geography: string | null;
  evidenceCount: number;
  conversionCount: number;
  priorityScore: number;
  recommendation: string;
  components: readonly string[];
};

/**
 * Turns repeated, unmet demand into concrete internal recommendations —
 * product, content, marketplace supply, host acquisition or renter demand.
 * Nothing here publishes anything; a human decides what, if anything, to build.
 */
export function buildInnovationRecommendations(
  opportunities: readonly GrowthOpportunity[],
  outcomes: Map<string, OutcomeTotals>,
  validationCount: number,
): InnovationRecommendation[] {
  const out: InnovationRecommendation[] = [];
  for (const opportunity of opportunities) {
    if (opportunity.frequency < validationCount) continue;
    const totals = outcomes.get(opportunity.key);
    const geography = opportunity.situation.location.label;
    const audience = String(opportunity.audience.primary);

    const kind: InsightKind =
      opportunity.fit.verdict === "NEW_OPPORTUNITY"
        ? "PRODUCT"
        : audience === "HOST"
          ? "HOST_SUPPLY"
          : opportunity.supply.level === "LEVEL_1_NO_SUPPLY" && geography
            ? "MARKETPLACE"
            : "RENTER_DEMAND";

    const recommendation =
      kind === "PRODUCT"
        ? "Repeated need with no dedicated EarnRoom journey. Review whether a capability or combination should exist."
        : kind === "HOST_SUPPLY"
          ? `Host-side interest${geography ? ` around ${geography}` : ""}. Consider targeted host acquisition content.`
          : kind === "MARKETPLACE"
            ? `Demand${geography ? ` in ${geography}` : ""} with no published supply. Supply acquisition is the blocker, not demand.`
            : "Recurring renter demand that existing journeys already serve. Consider content and internal linking.";

    out.push({
      opportunityKey: opportunity.key,
      kind,
      title: `${audience.toLowerCase()} · ${opportunity.situation.problem ?? "unclassified need"}`,
      problem: opportunity.situation.summary,
      audience,
      geography,
      evidenceCount: opportunity.frequency,
      conversionCount: totals?.converted ?? 0,
      priorityScore:
        Math.round(
          (opportunity.scores.opportunity * 0.6 +
            Math.min(opportunity.frequency, 50) * 0.6 +
            (totals?.converted ?? 0) * 4) *
            100,
        ) / 100,
      recommendation,
      components: opportunity.fit.capabilities,
    });
  }
  return out.sort((a, b) => b.priorityScore - a.priorityScore);
}

/** Converts a recommendation back into the shared insight shape for reporting. */
export function recommendationToInsight(item: InnovationRecommendation): GrowthInsight {
  return {
    id: `insight:${item.opportunityKey}:${item.kind}`,
    kind: item.kind,
    title: item.title,
    problem: item.problem,
    audience: item.audience,
    geography: item.geography,
    evidenceCount: item.evidenceCount,
    supportingKeys: [item.opportunityKey],
    recommendation: item.recommendation,
    components: item.components,
    confidence: Math.min(1, item.evidenceCount / 10),
    status: "VALIDATED",
  };
}
