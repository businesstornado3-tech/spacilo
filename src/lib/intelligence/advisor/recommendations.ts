/**
 * Milestone 2 + 3 — Recommendation Engine V2.
 *
 * The chain runs in one direction and each link may only use what the links
 * before it established:
 *
 *   inventory → space → access → weight → fragility → host rules → pricing →
 *   distance → availability → risk → future capacity → recommendation
 *
 * Every recommendation carries a reason, the evidence behind it, a confidence,
 * an alternative and the trade-off. None of those five is optional.
 */
import type { InventoryLine } from "@/lib/spaceplanner/types";

import type {
  ExplainedRecommendation,
  ListingAssessment,
  RecommendationRequest,
} from "./contracts";
import type { RecommendationImpact, RecommendationKind } from "../contracts";

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

interface Draft {
  id: string;
  kind: RecommendationKind;
  action: string;
  reason: string;
  evidence: string[];
  confidence: number;
  impact: RecommendationImpact;
  alternative: string;
  tradeOff: string;
}

function heaviest(lines: InventoryLine[]): InventoryLine | undefined {
  return lines.find((line) => line.item.weight === "heavy");
}

function bulkiest(lines: InventoryLine[]): InventoryLine | undefined {
  return [...lines].sort(
    (a, b) =>
      b.item.width * b.item.depth * b.item.height - a.item.width * a.item.depth * a.item.height,
  )[0];
}

/**
 * Builds the full chain for one listing. `lines` is the inventory that was
 * assessed, so nothing here needs to re-derive it.
 */
export function recommendForListing(
  lines: InventoryLine[],
  assessment: ListingAssessment,
  request: Pick<RecommendationRequest, "budgetPence" | "maxDistanceKm"> = {},
): ExplainedRecommendation[] {
  const { listing, analysis, score } = assessment;
  const drafts: Draft[] = [];

  /* 1. inventory ------------------------------------------------------- */
  const bulky = bulkiest(lines);
  if (bulky && bulky.item.width / 100 > listing.space.doorWidth - 0.1) {
    drafts.push({
      id: "inventory-oversized",
      kind: "orientation",
      action: `Turn the ${bulky.item.name.toLowerCase()} on its side before the doorway`,
      reason: `Its widest face is about ${(bulky.item.width / 100).toFixed(2)}m against a ${listing.space.doorWidth.toFixed(2)}m opening.`,
      evidence: [
        `Opening measured at ${analysis.access.doorWidthM.toFixed(2)}m.`,
        `Largest item face ${(bulky.item.width / 100).toFixed(2)}m.`,
      ],
      confidence: 0.82,
      impact: "high",
      alternative: "Dismantle the item and carry it through in parts.",
      tradeOff: "Turning it needs two people and a clear approach.",
    });
  }

  /* 2. space ----------------------------------------------------------- */
  drafts.push({
    id: "space-fit",
    kind: "capacity",
    action: score.value >= 78 ? "Proceed with this space" : "Look at a larger space",
    reason: `${score.band} — about ${score.fitPercent}% of the usable volume is needed.`,
    evidence: [
      `Usable volume about ${analysis.usable.availableVolumeM3.toFixed(1)}m³.`,
      `Around ${assessment.remainingVolumeM3.toFixed(1)}m³ would remain spare.`,
      `${assessment.floorClearPercent}% of the floor stays clear.`,
    ],
    confidence: assessment.confidence,
    impact: "high",
    alternative:
      score.value >= 78
        ? "Split the load across two smaller spaces if you would rather stay local."
        : "Keep this space and store the bulkiest two items elsewhere.",
    tradeOff:
      score.value >= 78
        ? "A tighter pack means less room to add things later."
        : "A larger space costs more each month.",
  });

  /* 3. access ----------------------------------------------------------- */
  if (analysis.access.access !== "easy") {
    drafts.push({
      id: "access-route",
      kind: "access",
      action: "Plan the carry-in route before the handover",
      reason: `Access is ${analysis.access.access} — ${analysis.access.notes[0] ?? "the approach is constrained"}.`,
      evidence: analysis.access.route.slice(0, 3),
      confidence: 0.76,
      impact: "medium",
      alternative: "Book a two-person move for the first load.",
      tradeOff: "Loading takes longer on the day.",
    });
  }

  /* 4. weight ----------------------------------------------------------- */
  const heavy = heaviest(lines);
  if (heavy) {
    drafts.push({
      id: "weight-low",
      kind: "safety",
      action: `Keep the ${heavy.item.name.toLowerCase()} on the floor`,
      reason: "Heavy items stacked high are the most common cause of damage in storage.",
      evidence: [
        `Floor is ${analysis.geometry.floor.loadBearing ? "load bearing" : "not confirmed as load bearing"}.`,
        `Heaviest class in this inventory: ${heavy.item.weight}.`,
      ],
      confidence: 0.9,
      impact: "high",
      alternative: "Use a low shelf rated for the weight instead of the floor.",
      tradeOff: "Floor-level items are harder to reach past.",
    });
  }

  /* 5. fragility -------------------------------------------------------- */
  const fragile = lines.find((line) => line.item.fragile);
  if (fragile) {
    drafts.push({
      id: "fragile-high",
      kind: "safety",
      action: `Store the ${fragile.item.name.toLowerCase()} above floor level`,
      reason: "Fragile items belong off the floor and out of the walking line.",
      evidence: [
        `${lines.filter((line) => line.item.fragile).length} fragile line(s) in this inventory.`,
        analysis.shelves.length
          ? `${analysis.shelves.length} shelf run(s) available.`
          : "No shelving in this space yet.",
      ],
      confidence: 0.84,
      impact: "medium",
      alternative: "Box fragile items together and mark the box clearly.",
      tradeOff: "Higher storage is harder to reach mid-stay.",
    });
  }

  /* 6. host rules ------------------------------------------------------- */
  const restrictedZone = analysis.zones.find((zone) => zone.restrictions.length > 0);
  if (restrictedZone) {
    drafts.push({
      id: "host-rules",
      kind: "placement",
      action: `Keep the ${restrictedZone.label.toLowerCase()} within its stated limits`,
      reason: restrictedZone.restrictions[0] ?? "The host set limits on this zone.",
      evidence: [restrictedZone.reason, ...restrictedZone.restrictions.slice(0, 2)],
      confidence: restrictedZone.confidence,
      impact: "medium",
      alternative: "Ask the host whether the limit can be relaxed for your items.",
      tradeOff: "Working around the limit uses more of the remaining volume.",
    });
  }

  /* 7. pricing ---------------------------------------------------------- */
  if (request.budgetPence !== undefined) {
    const within = listing.monthlyPence <= request.budgetPence;
    drafts.push({
      id: "pricing-budget",
      kind: "capacity",
      action: within ? "This sits inside your budget" : "Expect to stretch your budget",
      reason: `£${(listing.monthlyPence / 100).toFixed(0)} a month against a £${(request.budgetPence / 100).toFixed(0)} ceiling.`,
      evidence: [
        `Asking price £${(listing.monthlyPence / 100).toFixed(0)} per month.`,
        `Your ceiling £${(request.budgetPence / 100).toFixed(0)} per month.`,
      ],
      confidence: 0.95,
      impact: within ? "low" : "high",
      alternative: within
        ? "Consider a shorter minimum stay to keep costs flexible."
        : "Look at a smaller space or a slightly longer travel distance.",
      tradeOff: within ? "Cheaper spaces are often further away." : "Stretching now limits later moves.",
    });
  }

  /* 8. distance --------------------------------------------------------- */
  if (request.maxDistanceKm !== undefined && listing.distanceKm > request.maxDistanceKm) {
    drafts.push({
      id: "distance-far",
      kind: "access",
      action: "Plan for fewer, larger visits",
      reason: `At ${listing.distanceKm.toFixed(1)}km this is beyond the ${request.maxDistanceKm}km you set.`,
      evidence: [`Distance ${listing.distanceKm.toFixed(1)}km.`, `Your limit ${request.maxDistanceKm}km.`],
      confidence: 0.9,
      impact: "medium",
      alternative: "Filter to spaces inside your travel limit.",
      tradeOff: "Closer spaces in this area tend to cost more.",
    });
  }

  /* 9. availability ------------------------------------------------------ */
  if (!listing.availableNow) {
    drafts.push({
      id: "availability",
      kind: "capacity",
      action: "Ask the host for the first available date",
      reason: "This space is not listed as available immediately.",
      evidence: ["Availability flag is not set to available now."],
      confidence: 0.7,
      impact: "medium",
      alternative: "Hold a second choice while you wait for the date.",
      tradeOff: "Waiting risks losing the space to another renter.",
    });
  }

  /* 10. risk ------------------------------------------------------------- */
  const failing = score.checks.filter((check) => check.state !== "passed");
  for (const check of failing) {
    drafts.push({
      id: `risk-${check.id}`,
      kind: check.state === "failed" ? "capacity" : "placement",
      action: `Resolve: ${check.label}`,
      reason: check.detail,
      evidence: [
        `Check "${check.label}" is ${check.state === "failed" ? "not met" : "borderline"}.`,
        `Overall fit score ${score.value}.`,
      ],
      confidence: check.state === "failed" ? 0.9 : 0.72,
      impact: check.state === "failed" ? "high" : "medium",
      alternative: "Ask the host to confirm the measurement before you book.",
      tradeOff: "Confirming takes a day or two before you can commit.",
    });
  }

  /* 11. future capacity --------------------------------------------------- */
  drafts.push({
    id: "future-capacity",
    kind: "capacity",
    action:
      assessment.remainingVolumeM3 >= 1
        ? "Keep the spare volume for later additions"
        : "Reserve extra volume before you commit",
    reason: `About ${assessment.remainingVolumeM3.toFixed(1)}m³ would remain after this pack.`,
    evidence: [
      `Expansion potential ${pct(analysis.health.expansionPotential)}%.`,
      `Maximum capacity about ${analysis.optimisation.maximumCapacityM3.toFixed(1)}m³.`,
    ],
    confidence: 0.78,
    impact: assessment.remainingVolumeM3 >= 1 ? "low" : "medium",
    alternative: "Agree with the host now that more volume can be added later.",
    tradeOff: "Reserving volume you do not use still costs money.",
  });

  return drafts
    .map((draft) => ({
      ...draft,
      confidence: Math.round(Math.min(1, Math.max(0, draft.confidence)) * 100) / 100,
    }))
    .sort(
      (a, b) =>
        impactRank(b.impact) - impactRank(a.impact) ||
        b.confidence - a.confidence ||
        a.id.localeCompare(b.id),
    );
}

function impactRank(impact: RecommendationImpact): number {
  return impact === "high" ? 3 : impact === "medium" ? 2 : 1;
}
