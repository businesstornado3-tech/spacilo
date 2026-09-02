/**
 * Milestone 7 — host insights.
 *
 * The host-facing half of the advisor. Everything is derived from the space
 * analysis the host already has; money figures are estimates and say so.
 */
import type { HostInsight, ListingAssessment } from "./contracts";

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function buildHostInsights(assessment: ListingAssessment): HostInsight[] {
  const { analysis, listing } = assessment;
  const insights: HostInsight[] = [];
  const monthly = listing.monthlyPence;

  if (analysis.shelves.length === 0 && analysis.usable.wallCapacityM2 > 4) {
    insights.push({
      id: "shelving",
      kind: "shelving",
      title: "Install shelving on the longest wall",
      detail: `About ${analysis.usable.wallCapacityM2.toFixed(1)}m² of mountable wall is doing nothing.`,
      evidence: [
        `Mountable wall area ${analysis.usable.wallCapacityM2.toFixed(1)}m².`,
        `Dead space about ${analysis.usable.deadSpaceM3.toFixed(1)}m³.`,
      ],
      upliftPence: Math.round(monthly * 0.12),
      effort: "medium",
      confidence: 0.75,
      priority: "high",
    });
  }

  if (analysis.access.access !== "easy") {
    insights.push({
      id: "access",
      kind: "access",
      title: "Improve the approach to the opening",
      detail: `Access is currently ${analysis.access.access}, which puts renters off before they enquire.`,
      evidence: analysis.access.notes.slice(0, 2).length
        ? analysis.access.notes.slice(0, 2)
        : [`Walkway width about ${analysis.access.walkwayWidthM.toFixed(2)}m.`],
      upliftPence: null,
      effort: "medium",
      confidence: 0.72,
      priority: "high",
    });
  }

  if (!listing.features.includes("lighting")) {
    insights.push({
      id: "lighting",
      kind: "lighting",
      title: "Add lighting",
      detail: "Lit spaces photograph better and are easier to hand over after dark.",
      evidence: ["No lighting listed among the space features."],
      upliftPence: Math.round(monthly * 0.05),
      effort: "low",
      confidence: 0.7,
      priority: "medium",
    });
  }

  if (analysis.health.organisation < 70) {
    insights.push({
      id: "zoning",
      kind: "zoning",
      title: "Reorganise into clear zones",
      detail: `Organisation scores ${pct(analysis.health.organisation)} — marked zones make the space feel larger and safer.`,
      evidence: [
        `${analysis.zones.length} zone(s) proposed by EarnRoom AI.`,
        `Utilisation ${pct(analysis.health.utilisation)}%.`,
      ],
      upliftPence: null,
      effort: "low",
      confidence: 0.68,
      priority: "medium",
    });
  }

  const spaceScore = analysis.compatibility.spaceScore;
  if (spaceScore >= 85 && listing.hostRating >= 4.5) {
    insights.push({
      id: "pricing-up",
      kind: "pricing_up",
      title: "Your price may be under the mark",
      detail: `This space scores ${spaceScore} with a ${listing.hostRating.toFixed(1)} host rating — comparable spaces ask more.`,
      evidence: [
        `Space score ${spaceScore}/100.`,
        `Current price £${(monthly / 100).toFixed(0)} per month.`,
      ],
      upliftPence: Math.round(monthly * 0.1),
      effort: "low",
      confidence: 0.62,
      priority: "medium",
    });
  } else if (spaceScore < 60) {
    insights.push({
      id: "pricing-down",
      kind: "pricing_down",
      title: "Consider a lower asking price",
      detail: `A space score of ${spaceScore} takes longer to let at the current price.`,
      evidence: [`Space score ${spaceScore}/100.`, `Access is ${analysis.access.access}.`],
      upliftPence: null,
      effort: "low",
      confidence: 0.6,
      priority: "medium",
    });
  }

  const business = analysis.suitability.find((entry) => entry.use === "business");
  if (business && business.score >= 70) {
    insights.push({
      id: "business",
      kind: "business",
      title: "Open the space up to business storage",
      detail: `It rates ${business.rating} for business use, which usually means longer stays.`,
      evidence: business.reasons.slice(0, 2).length
        ? business.reasons.slice(0, 2)
        : [`Business suitability scored ${business.score}/100.`],
      upliftPence: Math.round(monthly * 0.15),
      effort: "low",
      confidence: business.confidence,
      priority: "high",
    });
  }

  if (analysis.access.loading !== "easy") {
    insights.push({
      id: "loading",
      kind: "loading",
      title: "Make loading easier",
      detail: `Loading is ${analysis.access.loading}; a step-free run from the kerb is the single biggest improvement.`,
      evidence: [`Loading assessed as ${analysis.access.loading}.`, ...analysis.access.route.slice(0, 1)],
      upliftPence: null,
      effort: "high",
      confidence: 0.66,
      priority: "low",
    });
  }

  return insights.sort(
    (a, b) => rank(b.priority) - rank(a.priority) || (b.upliftPence ?? 0) - (a.upliftPence ?? 0),
  );
}

function rank(priority: HostInsight["priority"]): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}
