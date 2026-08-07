/**
 * Milestone 5 — multi-listing comparison.
 *
 * The table is the ranking's facts laid side by side, and the awards are
 * decided by rule, not by taste: each one states the rule it applied.
 */
import type {
  ComparisonAward,
  ComparisonResult,
  ComparisonRow,
  ComparisonVerdict,
  RankedListing,
} from "./contracts";

const AWARD_LABELS: Record<ComparisonAward, string> = {
  best_overall: "Best overall",
  best_value: "Best value",
  best_premium: "Best premium",
  best_business: "Best for business",
};

function rowFor(entry: RankedListing): ComparisonRow {
  const { assessment } = entry;
  return {
    listingId: entry.listingId,
    title: entry.title,
    compatibility: assessment.score.value,
    monthlyPence: assessment.listing.monthlyPence,
    distanceKm: assessment.listing.distanceKm,
    accessibility: assessment.analysis.access.access,
    walkwayM: assessment.analysis.access.walkwayWidthM,
    remainingVolumeM3: assessment.remainingVolumeM3,
    overall: entry.score,
  };
}

/** Score per pound: the only honest way to call something "value". */
function valuePerPound(entry: RankedListing): number {
  const monthly = Math.max(1, entry.assessment.listing.monthlyPence / 100);
  return entry.score / monthly;
}

function premiumScore(entry: RankedListing): number {
  const { assessment } = entry;
  return (
    assessment.listing.hostRating * 10 +
    assessment.listing.security.length * 6 +
    assessment.analysis.health.overall * 0.4 +
    (assessment.listing.features.includes("heated") ? 6 : 0)
  );
}

function businessScore(entry: RankedListing): number {
  const { assessment } = entry;
  const business = assessment.analysis.suitability.find((entry) => entry.use === "business");
  return (
    (business?.score ?? 0) * 0.6 +
    (assessment.analysis.access.loading === "easy" ? 20 : 0) +
    (assessment.listing.availableNow ? 10 : 0) +
    assessment.remainingVolumeM3
  );
}

function pick(
  entries: RankedListing[],
  award: ComparisonAward,
  by: (entry: RankedListing) => number,
  reason: (entry: RankedListing) => string,
): ComparisonVerdict {
  const best = [...entries].sort(
    (a, b) => by(b) - by(a) || a.listingId.localeCompare(b.listingId),
  )[0];
  return {
    award,
    label: AWARD_LABELS[award],
    listingId: best ? best.listingId : null,
    reason: best ? reason(best) : "No listing meets this comparison yet.",
  };
}

export function compareListings(entries: RankedListing[]): ComparisonResult {
  if (entries.length === 0) {
    return { rows: [], verdicts: [], notes: ["Add at least one space to compare."] };
  }

  const rows = entries.map(rowFor);
  const verdicts: ComparisonVerdict[] = [
    pick(
      entries,
      "best_overall",
      (entry) => entry.score,
      (entry) =>
        `${entry.title} scores ${entry.score} across all nine ranking factors, with ${entry.assessment.score.band.toLowerCase()}.`,
    ),
    pick(
      entries,
      "best_value",
      valuePerPound,
      (entry) =>
        `${entry.title} returns the most score per pound at £${(entry.assessment.listing.monthlyPence / 100).toFixed(0)} a month.`,
    ),
    pick(
      entries,
      "best_premium",
      premiumScore,
      (entry) =>
        `${entry.title} pairs a ${entry.assessment.listing.hostRating.toFixed(1)} host rating with ${entry.assessment.listing.security.length} security feature${entry.assessment.listing.security.length === 1 ? "" : "s"}.`,
    ),
    pick(
      entries,
      "best_business",
      businessScore,
      (entry) =>
        `${entry.title} has ${entry.assessment.analysis.access.loading} loading access and about ${entry.assessment.remainingVolumeM3.toFixed(1)}m³ spare.`,
    ),
  ];

  const notes = [
    "Every figure is an estimate from the measurements on file, not a survey.",
    entries.length === 1
      ? "Only one space is being compared, so the awards all point to it."
      : `Comparing ${entries.length} spaces against the same inventory.`,
  ];

  return { rows, verdicts, notes };
}
