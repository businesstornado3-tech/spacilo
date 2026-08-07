/**
 * Milestone 11 — host intelligence.
 *
 * Turns the analysis into things a host could actually do, each with the
 * evidence behind it and an honest, cautious estimate of what it might be
 * worth. Uplift figures are estimates, never promises of income.
 */
import type {
  AccessAnalysis,
  HostRecommendation,
  RoomGeometry,
  Shelf,
  SpaceAnalysisInput,
  SpaceOptimisation,
  SpaceSuitability,
  UsableSpace,
} from "./contracts";
import { clamp01, round1 } from "./geometry";

interface Draft {
  id: string;
  kind: HostRecommendation["kind"];
  action: string;
  reason: string;
  evidence: string[];
  upliftPence: number | null;
  effort: HostRecommendation["effort"];
  confidence: number;
  priority: HostRecommendation["priority"];
}

export function recommendForHost(
  input: SpaceAnalysisInput,
  geometry: RoomGeometry,
  usable: UsableSpace,
  access: AccessAnalysis,
  optimisation: SpaceOptimisation,
  suitability: SpaceSuitability[],
  shelves: Shelf[],
): HostRecommendation[] {
  const features = input.features ?? [];
  const monthlyPence = input.monthlyPence ?? 0;
  const drafts: Draft[] = [];

  if (shelves.length === 0 && usable.wallCapacityM2 > 3) {
    drafts.push({
      id: "install-shelving",
      kind: "shelving",
      action: "Install a shelving run along one wall",
      reason: "Shelving converts wall area into storable volume and keeps the floor walkable.",
      evidence: [
        `${round1(usable.wallCapacityM2)}m² of mountable wall is unused.`,
        `${usable.ceilingVolumeM3}m³ sits above stacking height today.`,
      ],
      upliftPence: monthlyPence > 0 ? Math.round(monthlyPence * 0.12) : null,
      effort: "medium",
      confidence: 0.78,
      priority: "high",
    });
  }

  if (!features.includes("lighting")) {
    drafts.push({
      id: "improve-lighting",
      kind: "lighting",
      action: "Add lighting at the opening and over the main run",
      reason: "Renters judge a space on the photos and on how easy it feels to use after dark.",
      evidence: ["No lighting declared for this space."],
      upliftPence: monthlyPence > 0 ? Math.round(monthlyPence * 0.05) : null,
      effort: "low",
      confidence: 0.72,
      priority: "medium",
    });
  }

  if (access.access === "difficult" || access.access === "restricted") {
    drafts.push({
      id: "improve-access",
      kind: "access",
      action: "Clear the route and widen the approach to the opening",
      reason: "Access is the single biggest reason a renter rules a space out.",
      evidence: [
        `Opening ${access.doorWidthM}m wide × ${access.doorHeightM}m high.`,
        ...access.notes,
      ],
      upliftPence: null,
      effort: "medium",
      confidence: 0.8,
      priority: "high",
    });
  }

  if (access.loading === "difficult" || access.loading === "restricted") {
    drafts.push({
      id: "improve-loading",
      kind: "loading",
      action: "Create a step-free set-down area outside the opening",
      reason: "A place to set things down shortens every handover and reduces damage.",
      evidence: [`Loading rated ${access.loading}.`],
      upliftPence: null,
      effort: "medium",
      confidence: 0.7,
      priority: "medium",
    });
  }

  const business = suitability.find((entry) => entry.use === "business");
  if (business && (business.rating === "ideal" || business.rating === "suitable")) {
    drafts.push({
      id: "offer-business-storage",
      kind: "business_storage",
      action: "Offer the space for business stock as well as household storage",
      reason: "Business renters book longer and value access over price.",
      evidence: [`Business suitability scored ${business.score}/100.`, ...business.reasons],
      upliftPence: monthlyPence > 0 ? Math.round(monthlyPence * 0.18) : null,
      effort: "low",
      confidence: 0.68,
      priority: "medium",
    });
  }

  if (optimisation.aiScore >= 72 && monthlyPence > 0) {
    drafts.push({
      id: "review-pricing",
      kind: "pricing",
      action: "Review the asking price against comparable local spaces",
      reason: "This space scores well on usable volume and access, which supports a firmer price.",
      evidence: [
        `Space score ${optimisation.aiScore}/100.`,
        `${optimisation.remainingVolumeM3}m³ available.`,
      ],
      upliftPence: Math.round(monthlyPence * 0.08),
      effort: "low",
      confidence: 0.64,
      priority: "low",
    });
  }

  if (optimisation.expansionVolumeM3 > 1.5) {
    drafts.push({
      id: "increase-capacity",
      kind: "capacity",
      action: "Recover the unused volume above head height",
      reason: "Overhead racking or a taller stack limit turns dead space into lettable volume.",
      evidence: optimisation.unusedAreas,
      upliftPence: monthlyPence > 0 ? Math.round(monthlyPence * 0.1) : null,
      effort: geometry.ceiling.supportsOverhead ? "medium" : "high",
      confidence: 0.66,
      priority: "medium",
    });
  }

  const fragile = suitability.find((entry) => entry.use === "fragile");
  if (fragile && fragile.rating === "limited") {
    drafts.push({
      id: "improve-protection",
      kind: "protection",
      action: "Add a raised pallet or matting under the storage area",
      reason: "Keeping contents off the floor protects against damp and widens what you can accept.",
      evidence: fragile.cautions,
      upliftPence: null,
      effort: "low",
      confidence: 0.7,
      priority: "low",
    });
  }

  const order: Record<HostRecommendation["priority"], number> = { high: 0, medium: 1, low: 2 };
  return drafts
    .map((draft) => ({ ...draft, confidence: Math.round(clamp01(draft.confidence) * 100) / 100 }))
    .sort((a, b) => order[a.priority] - order[b.priority] || a.id.localeCompare(b.id));
}
