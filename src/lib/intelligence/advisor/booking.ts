/**
 * Milestone 10 + 11 — booking intelligence and host acceptance.
 *
 * Both sides of the same decision, built from the same assessment. The renter
 * asks "should I book this?"; the host asks "should I accept this?". Neither
 * answer is allowed to appear without the factors that produced it.
 */
import type { InventoryLine } from "@/lib/spaceplanner/types";

import { buildDecisionCards, fitDecisionCard } from "./decisions";
import { recommendForListing } from "./recommendations";
import { buildSmartSuggestions } from "./suggestions";
import { scoreListing } from "./ranking";
import type {
  BookingIntelligence,
  BookingVerdict,
  HostAcceptance,
  ListingAssessment,
  RecommendationRequest,
} from "./contracts";

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const WEIGHTS = {
  compatibility: 5,
  distance: 2,
  price: 3,
  hostRating: 2,
  availability: 2,
  security: 1.5,
  accessibility: 2,
  efficiency: 1.5,
  confidence: 1.5,
} as const;

function verdictFor(score: number, everythingFits: boolean): BookingVerdict {
  if (!everythingFits) return score >= 70 ? "review_first" : "look_elsewhere";
  if (score >= 85) return "book_with_confidence";
  if (score >= 72) return "book_with_care";
  if (score >= 58) return "review_first";
  return "look_elsewhere";
}

const HEADLINES: Record<BookingVerdict, string> = {
  book_with_confidence: "Everything points to a comfortable fit",
  book_with_care: "A workable fit, with a couple of things to plan",
  review_first: "Worth checking a few details before you commit",
  look_elsewhere: "This space is likely to be too tight",
};

export function assessBooking(
  lines: InventoryLine[],
  assessment: ListingAssessment,
  request: Pick<RecommendationRequest, "budgetPence" | "maxDistanceKm"> = {},
): BookingIntelligence {
  const { factors, score: weighted } = scoreListing(assessment, {
    cheapestPence: assessment.listing.monthlyPence,
    dearestPence: assessment.listing.monthlyPence,
    weights: { ...WEIGHTS },
  });

  const recommendations = recommendForListing(lines, assessment, request);
  const suggestions = buildSmartSuggestions(lines, assessment);
  const everythingFits = assessment.score.checks.every((check) => check.state !== "failed");

  // Booking confidence leans on the fit itself; the commercial factors adjust it.
  const score = pct(assessment.score.value * 0.6 + weighted * 0.4);
  const verdict = verdictFor(score, everythingFits);

  const risks = [
    ...assessment.score.checks
      .filter((check) => check.state !== "passed")
      .map((check) => `${check.label}: ${check.detail}.`),
    ...(assessment.listing.availableNow ? [] : ["The space is not listed as available immediately."]),
    ...(assessment.listing.hostConfirmed
      ? []
      : ["Measurements are Spacilo AI estimates rather than host-confirmed."]),
  ];

  return {
    listingId: assessment.listing.id,
    verdict,
    headline: HEADLINES[verdict],
    score,
    confidence: assessment.confidence,
    factors,
    cards: buildDecisionCards(assessment, recommendations, suggestions),
    recommendations,
    suggestions,
    risks,
    futureCapacityM3: assessment.remainingVolumeM3,
  };
}

export function assessHostAcceptance(
  lines: InventoryLine[],
  assessment: ListingAssessment,
): HostAcceptance {
  const { analysis, score } = assessment;
  const everythingFits = score.checks.every((check) => check.state !== "failed");
  const accessStaysSafe =
    analysis.access.walkwayWidthM >= 0.6 &&
    score.checks.find((check) => check.id === "walkway")?.state !== "failed";

  const usable = Math.max(0.1, analysis.usable.availableVolumeM3);
  const remainingPercent = pct((assessment.remainingVolumeM3 / usable) * 100);

  const verdict: HostAcceptance["verdict"] = !everythingFits
    ? "decline"
    : accessStaysSafe && score.value >= 78
      ? "accept"
      : "accept_with_changes";

  const reasons = [
    `${score.band} — the pack needs about ${score.fitPercent}% of the usable volume.`,
    `Around ${assessment.remainingVolumeM3.toFixed(1)}m³ (${remainingPercent}%) would stay free for future bookings.`,
    `Walkway holds at about ${analysis.access.walkwayWidthM.toFixed(2)}m.`,
    `${lines.reduce((sum, line) => sum + line.quantity, 0)} item(s) across ${lines.length} line(s).`,
  ];

  const changes = everythingFits
    ? score.checks
        .filter((check) => check.state === "attention")
        .map((check) => `${check.label}: ${check.detail}.`)
    : ["Ask the renter to reduce the load or split it across two stays."];

  const headline =
    verdict === "accept"
      ? "Everything fits and access stays safe"
      : verdict === "accept_with_changes"
        ? "Workable, with a couple of conditions"
        : "This load is larger than the space can hold";

  const card = fitDecisionCard(assessment);

  return {
    verdict,
    headline,
    confidence: assessment.confidence,
    everythingFits,
    accessStaysSafe,
    remainingVolumeM3: assessment.remainingVolumeM3,
    remainingPercent,
    reasons,
    changes,
    cards: [
      {
        ...card,
        id: `host-${card.id}`,
        title: `${assessment.listing.title} — accept this booking?`,
        recommendation: headline,
        action:
          verdict === "accept"
            ? "Accept the request"
            : verdict === "accept_with_changes"
              ? "Accept with the conditions above"
              : "Decline and suggest a larger space",
        expectedBenefit:
          verdict === "decline"
            ? "Avoids a handover that cannot work on the day."
            : `Keeps about ${assessment.remainingVolumeM3.toFixed(1)}m³ free for a second booking.`,
      },
    ],
  };
}
