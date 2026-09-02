/**
 * Milestone 4 — the listing ranking engine.
 *
 * Nine factors, published weights, no hidden thumb on the scale. Renter
 * priorities lift a factor's weight; they never change its score, so the facts
 * stay the same however the list is sorted.
 */
import type {
  AdvisorPriority,
  ListingAssessment,
  RankedListing,
  RankingFactor,
  RankingFactorId,
  RankingResult,
} from "./contracts";

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const BASE_WEIGHTS: Record<RankingFactorId, number> = {
  compatibility: 5,
  distance: 2,
  price: 3,
  hostRating: 2,
  availability: 2,
  security: 1.5,
  accessibility: 2,
  efficiency: 1.5,
  confidence: 1.5,
};

const PRIORITY_BOOST: Record<AdvisorPriority, RankingFactorId[]> = {
  value: ["price"],
  distance: ["distance"],
  space: ["compatibility", "efficiency"],
  security: ["security"],
  access: ["accessibility"],
};

const LABELS: Record<RankingFactorId, string> = {
  compatibility: "Compatibility",
  distance: "Travel distance",
  price: "Price",
  hostRating: "Host rating",
  availability: "Availability",
  security: "Security",
  accessibility: "Accessibility",
  efficiency: "Space efficiency",
  confidence: "Confidence",
};

const ACCESS_SCORE = { easy: 100, moderate: 78, difficult: 52, restricted: 28 } as const;

function weightsFor(priorities: AdvisorPriority[]): Record<RankingFactorId, number> {
  const weights = { ...BASE_WEIGHTS };
  for (const priority of priorities) {
    for (const id of PRIORITY_BOOST[priority]) weights[id] = weights[id] * 1.6;
  }
  return weights;
}

function priceScore(monthlyPence: number, cheapest: number, dearest: number): number {
  if (dearest <= cheapest) return 100;
  return pct(100 - ((monthlyPence - cheapest) / (dearest - cheapest)) * 100);
}

function distanceScore(distanceKm: number): number {
  // Under a mile is effectively local; beyond 25km the advantage is gone.
  if (distanceKm <= 1.6) return 100;
  return pct(100 - ((distanceKm - 1.6) / 23.4) * 100);
}

export function scoreListing(
  assessment: ListingAssessment,
  context: { cheapestPence: number; dearestPence: number; weights: Record<RankingFactorId, number> },
): { score: number; factors: RankingFactor[] } {
  const { listing, analysis, score: fit } = assessment;
  const raw: Array<{ id: RankingFactorId; score: number; detail: string }> = [
    {
      id: "compatibility",
      score: fit.value,
      detail: `${fit.band} — about ${fit.fitPercent}% of the usable volume is needed`,
    },
    {
      id: "distance",
      score: distanceScore(listing.distanceKm),
      detail: `${listing.distanceKm.toFixed(1)}km away`,
    },
    {
      id: "price",
      score: priceScore(listing.monthlyPence, context.cheapestPence, context.dearestPence),
      detail: `£${(listing.monthlyPence / 100).toFixed(0)} per month`,
    },
    {
      id: "hostRating",
      score: pct((listing.hostRating / 5) * 100),
      detail:
        listing.reviews > 0
          ? `${listing.hostRating.toFixed(1)} from ${listing.reviews} review${listing.reviews === 1 ? "" : "s"}`
          : "No reviews yet",
    },
    {
      id: "availability",
      score: listing.availableNow ? 100 : 55,
      detail: listing.availableNow ? "Available now" : "Not available immediately",
    },
    {
      id: "security",
      score: pct(40 + listing.security.length * 20),
      detail: listing.security.length ? listing.security.join(", ") : "No security features listed",
    },
    {
      id: "accessibility",
      score: ACCESS_SCORE[analysis.access.access],
      detail: `${analysis.access.access} access through a ${analysis.access.doorWidthM.toFixed(2)}m opening`,
    },
    {
      id: "efficiency",
      score: pct(analysis.optimisation.spaceEfficiency * 100),
      detail: `${pct(analysis.optimisation.spaceEfficiency * 100)}% of the cube is usable`,
    },
    {
      id: "confidence",
      score: pct(assessment.confidence * 100),
      detail: listing.hostConfirmed ? "Host-confirmed measurements" : "EarnRoom AI estimate",
    },
  ];

  const factors: RankingFactor[] = raw.map((entry) => ({
    id: entry.id,
    label: LABELS[entry.id],
    score: entry.score,
    weight: context.weights[entry.id],
    detail: entry.detail,
  }));

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = pct(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) /
      Math.max(0.001, totalWeight),
  );

  return { score, factors };
}

/** The two or three factors that most explain a listing's position. */
export function topReasons(factors: RankingFactor[], limit = 3): string[] {
  return [...factors]
    .sort((a, b) => b.score * b.weight - a.score * a.weight || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((factor) => `${factor.label}: ${factor.detail}`);
}

export function rankListings(
  assessments: ListingAssessment[],
  priorities: AdvisorPriority[] = [],
): RankingResult {
  if (assessments.length === 0) return { entries: [], explanations: [] };

  const prices = assessments.map((entry) => entry.listing.monthlyPence);
  const context = {
    cheapestPence: Math.min(...prices),
    dearestPence: Math.max(...prices),
    weights: weightsFor(priorities),
  };

  const scored = assessments
    .map((assessment) => {
      const { score, factors } = scoreListing(assessment, context);
      return {
        listingId: assessment.listing.id,
        title: assessment.listing.title,
        rank: 0,
        score,
        factors,
        reasons: topReasons(factors),
        assessment,
      } satisfies RankedListing;
    })
    // Ties break on compatibility, then on id, so the order never wobbles.
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.assessment.score.value - a.assessment.score.value ||
        a.listingId.localeCompare(b.listingId),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const explanations: string[] = [];
  for (let index = 1; index < scored.length; index += 1) {
    const above = scored[index - 1];
    const below = scored[index];
    if (!above || !below) continue;
    const gap = [...above.factors]
      .map((factor) => {
        const rival = below.factors.find((entry) => entry.id === factor.id);
        return { factor, delta: (factor.score - (rival?.score ?? 0)) * factor.weight };
      })
      .sort((a, b) => b.delta - a.delta)[0];
    explanations.push(
      gap && gap.delta > 0
        ? `${above.title} ranks above ${below.title} mainly on ${gap.factor.label.toLowerCase()} — ${gap.factor.detail}.`
        : `${above.title} ranks above ${below.title} on a narrow overall margin (${above.score} against ${below.score}).`,
    );
  }

  return { entries: scored, explanations };
}
