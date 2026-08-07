/**
 * Milestones 18–20 — the advisor engine.
 *
 * One call in, one complete recommendation out. Everything the surfaces need
 * — ranking, comparison, advice, suggestions, decision cards, the reasoning
 * timeline and the booking verdict — comes from a single deterministic run, so
 * no two panels can ever disagree with one another.
 */
import type { InventoryLine } from "@/lib/spaceplanner/types";

import { assessAll, assessListing } from "./assess";
import { assessBooking, assessHostAcceptance } from "./booking";
import { compareListings } from "./comparison";
import { buildDecisionCards } from "./decisions";
import { buildHostInsights } from "./insights";
import { rankListings } from "./ranking";
import { recommendForListing } from "./recommendations";
import { buildSmartSuggestions } from "./suggestions";
import { buildTimeline } from "./timeline";
import {
  ADVISOR_CONTRACT_VERSION,
  ADVISOR_ENGINE_ID,
  type AdvisorListing,
  type AdvisorMeta,
  type HostInsight,
  type ListingAssessment,
  type RecommendationRequest,
  type RecommendationResponse,
} from "./contracts";

function meta(startedAt: number): AdvisorMeta {
  return {
    engine: ADVISOR_ENGINE_ID,
    contractVersion: ADVISOR_CONTRACT_VERSION,
    producedAt: Date.now(),
    latencyMs: Math.max(0, Date.now() - startedAt),
  };
}

const EMPTY = (startedAt: number): RecommendationResponse => ({
  ranking: { entries: [], explanations: [] },
  comparison: { rows: [], verdicts: [], notes: ["No listings were supplied to compare."] },
  best: null,
  recommendations: [],
  suggestions: [],
  cards: [],
  timeline: [],
  booking: null,
  meta: meta(startedAt),
});

/** The advisor's single public operation. */
export function recommend(request: RecommendationRequest): RecommendationResponse {
  const startedAt = Date.now();
  const { lines, listings, priorities = [] } = request;
  if (listings.length === 0) return EMPTY(startedAt);

  const assessments = assessAll(lines, listings);
  const ranking = rankListings(assessments, priorities);
  const comparison = compareListings(ranking.entries);
  const best = ranking.entries[0]?.assessment ?? null;

  if (!best) return { ...EMPTY(startedAt), ranking, comparison };

  const recommendations = recommendForListing(lines, best, request);
  const suggestions = buildSmartSuggestions(lines, best);
  const cards = buildDecisionCards(best, recommendations, suggestions);
  const booking = assessBooking(lines, best, request);
  const timeline = buildTimeline({
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    assessment: best,
    recommendationCount: recommendations.length,
  });

  return {
    ranking,
    comparison,
    best,
    recommendations,
    suggestions,
    cards,
    timeline,
    booking,
    meta: meta(startedAt),
  };
}

/** Everything a renter needs for one listing, without ranking a shortlist. */
export function adviseListing(lines: InventoryLine[], listing: AdvisorListing) {
  const assessment = assessListing(lines, listing);
  const recommendations = recommendForListing(lines, assessment);
  const suggestions = buildSmartSuggestions(lines, assessment);
  return {
    assessment,
    recommendations,
    suggestions,
    cards: buildDecisionCards(assessment, recommendations, suggestions),
    booking: assessBooking(lines, assessment),
    timeline: buildTimeline({
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      assessment,
      recommendationCount: recommendations.length,
    }),
  };
}

/** Everything a host needs about one incoming request against their space. */
export function adviseHost(
  lines: InventoryLine[],
  listing: AdvisorListing,
): { assessment: ListingAssessment; acceptance: ReturnType<typeof assessHostAcceptance>; insights: HostInsight[] } {
  const assessment = assessListing(lines, listing);
  return {
    assessment,
    acceptance: assessHostAcceptance(lines, assessment),
    insights: buildHostInsights(assessment),
  };
}
