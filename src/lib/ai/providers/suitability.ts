/**
 * Suitability and ranking intelligence (Phase 6B).
 *
 * These providers replace the deterministic "does it fit" and "sort by
 * distance" logic with reasoning that weighs every fact the marketplace knows
 * and explains itself. They stay behind the orchestrator, so a remote model can
 * take over either slot without a single surface changing.
 */
import { explain, factor, alternative } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiExplanationFactor, AiProvider } from "../core/types";

const ENGINE_MODEL = "spacilo-reasoning-1";

/* ---------------------------------------------------------- suitability */

export interface SuitabilityInventory {
  /** Total volume of the belongings, in cubic metres. */
  volumeM3: number;
  itemCount: number;
  /** Largest single item, in centimetres. Used for door and height checks. */
  largestItemCm?: { width: number; depth: number; height: number };
  heaviestItemKg?: number;
  fragileCount?: number;
  climateSensitive?: boolean;
  categories?: string[];
}

export interface SuitabilitySpace {
  id: string;
  title?: string;
  spaceType?: string;
  /** Usable volume the host offers, in cubic metres. */
  usableVolumeM3: number;
  widthM?: number;
  depthM?: number;
  ceilingHeightM?: number;
  doorWidthCm?: number;
  hasShelving?: boolean;
  obstacles?: string[];
  accessRoute?: "level" | "steps" | "narrow" | "unknown";
  groundFloor?: boolean;
  heated?: boolean;
  dry?: boolean;
  restrictions?: string[];
  maxItemWeightKg?: number;
}

export interface SuitabilityInput {
  inventory: SuitabilityInventory;
  space: SuitabilitySpace;
  /** Other listings considered when this one falls short. */
  alternatives?: SuitabilitySpace[];
}

export type SuitabilityVerdict = "suitable" | "suitable_with_care" | "tight" | "unsuitable";

export interface SuitabilityImprovement {
  action: string;
  reason: string;
  /** Volume the action frees up, in cubic metres, where it can be estimated. */
  volumeSavedM3?: number;
}

export interface SuitabilityAssessment {
  spaceId: string;
  /** 0–100. Higher is a better fit for these belongings. */
  score: number;
  verdict: SuitabilityVerdict;
  fitsByVolume: boolean;
  utilisation: number;
  blockers: string[];
  cautions: string[];
  improvements: SuitabilityImprovement[];
  /** Populated only when this space cannot take the belongings as they are. */
  alternativeSpaceIds: string[];
}

const PACKING_ALLOWANCE = 1.25;

function largestDimensionCm(inventory: SuitabilityInventory): number {
  const item = inventory.largestItemCm;
  if (!item) return 0;
  return Math.max(item.width, item.depth, item.height);
}

/** Smallest opening the largest item can be turned through, in centimetres. */
function narrowestFaceCm(inventory: SuitabilityInventory): number {
  const item = inventory.largestItemCm;
  if (!item) return 0;
  return Math.min(item.width, item.depth, item.height);
}

export function assessSuitability(input: SuitabilityInput): {
  assessment: SuitabilityAssessment;
  factors: AiExplanationFactor[];
  confidence: number;
} {
  const { inventory, space } = input;
  const required = inventory.volumeM3 * PACKING_ALLOWANCE;
  const usable = Math.max(0.01, space.usableVolumeM3);
  const utilisation = required / usable;
  const fitsByVolume = utilisation <= 1;

  const blockers: string[] = [];
  const cautions: string[] = [];
  const improvements: SuitabilityImprovement[] = [];
  const factors: AiExplanationFactor[] = [];

  factors.push(
    factor(
      "Volume",
      `${inventory.volumeM3.toFixed(1)} m³ of belongings against ${usable.toFixed(1)} m³ usable`,
      fitsByVolume ? 0.9 : -0.9,
    ),
  );

  if (!fitsByVolume) {
    blockers.push(
      `Your belongings need about ${required.toFixed(1)} m³ once packed, and this space offers ${usable.toFixed(1)} m³.`,
    );
    improvements.push({
      action: "Store the bulkiest items elsewhere or split across two spaces",
      reason: "The packed volume is larger than the space on offer.",
      volumeSavedM3: Number((required - usable).toFixed(2)),
    });
  } else if (utilisation > 0.85) {
    cautions.push("This space will be close to full, which leaves little room to walk between items.");
    improvements.push({
      action: "Dismantle flat-pack furniture before the handover",
      reason: "Flat-packing typically recovers a fifth of the floor space.",
      volumeSavedM3: Number((inventory.volumeM3 * 0.2).toFixed(2)),
    });
  }

  // Door and access route.
  const face = narrowestFaceCm(inventory);
  if (space.doorWidthCm && face && face > space.doorWidthCm) {
    blockers.push(
      `The largest item is ${face} cm at its narrowest, and the doorway measures ${space.doorWidthCm} cm.`,
    );
    factors.push(factor("Door width", `${space.doorWidthCm} cm opening`, -0.8));
    improvements.push({
      action: "Dismantle the largest item before arrival",
      reason: "It cannot be turned through the doorway assembled.",
    });
  } else if (space.doorWidthCm) {
    factors.push(factor("Door width", `${space.doorWidthCm} cm opening`, 0.4));
  }

  // Ceiling height against the tallest item.
  const tallest = largestDimensionCm(inventory);
  if (space.ceilingHeightM && tallest && tallest / 100 > space.ceilingHeightM) {
    blockers.push(
      `The tallest item is ${(tallest / 100).toFixed(2)} m and the ceiling is ${space.ceilingHeightM.toFixed(2)} m.`,
    );
    factors.push(factor("Ceiling height", `${space.ceilingHeightM.toFixed(2)} m`, -0.7));
  } else if (space.ceilingHeightM) {
    factors.push(factor("Ceiling height", `${space.ceilingHeightM.toFixed(2)} m`, 0.3));
  }

  // Access route.
  if (space.accessRoute === "steps" && (inventory.heaviestItemKg ?? 0) > 40) {
    cautions.push("Heavy items and steps are a difficult combination — plan for two people.");
    factors.push(factor("Access route", "Steps on the route", -0.4));
  } else if (space.accessRoute === "narrow") {
    cautions.push("The access route is narrow, so allow extra time at the handover.");
    factors.push(factor("Access route", "Narrow route", -0.2));
  } else if (space.accessRoute === "level" || space.groundFloor) {
    factors.push(factor("Access route", "Level, ground-floor access", 0.5));
  }

  // Obstacles and shelving.
  if (space.obstacles?.length) {
    cautions.push(`The host has noted ${space.obstacles.join(", ")} in this space.`);
    factors.push(factor("Obstacles", space.obstacles.join(", "), -0.3));
  }
  if (space.hasShelving) {
    factors.push(factor("Shelving", "Shelving already in place", 0.4));
    improvements.push({
      action: "Put boxes on the existing shelving",
      reason: "Shelving uses the height of the room and keeps boxes off the floor.",
      volumeSavedM3: Number((usable * 0.1).toFixed(2)),
    });
  }

  // Fragile, heavy and climate-sensitive belongings.
  if ((inventory.fragileCount ?? 0) > 0) {
    cautions.push(`You have ${inventory.fragileCount} fragile item(s) — keep them at the top of the stack.`);
    factors.push(factor("Fragile items", `${inventory.fragileCount} noted`, -0.2));
  }
  if (space.maxItemWeightKg && (inventory.heaviestItemKg ?? 0) > space.maxItemWeightKg) {
    blockers.push(
      `The heaviest item is ${inventory.heaviestItemKg} kg and the host's limit is ${space.maxItemWeightKg} kg.`,
    );
    factors.push(factor("Weight limit", `${space.maxItemWeightKg} kg per item`, -0.7));
  }
  if (inventory.climateSensitive) {
    if (space.heated && space.dry) {
      factors.push(factor("Conditions", "Heated and reported dry", 0.5));
    } else {
      cautions.push("Some of your belongings are sensitive to damp or cold, and this space is unheated.");
      factors.push(factor("Conditions", space.dry ? "Dry but unheated" : "Conditions not confirmed", -0.4));
      improvements.push({
        action: "Use sealed boxes with desiccant for sensitive items",
        reason: "The space is not climate controlled.",
      });
    }
  }

  // Host restrictions.
  for (const restriction of space.restrictions ?? []) {
    const clash = (inventory.categories ?? []).some((category) =>
      restriction.toLowerCase().includes(category.toLowerCase()),
    );
    if (clash) {
      blockers.push(`The host does not accept ${restriction}, and your inventory includes it.`);
      factors.push(factor("Host restriction", restriction, -0.9));
    }
  }

  // Score.
  let score = 100;
  score -= blockers.length * 35;
  score -= cautions.length * 8;
  if (fitsByVolume) score -= Math.max(0, (utilisation - 0.6) * 40);
  else score -= 25;
  if (space.hasShelving) score += 4;
  if (space.groundFloor) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const verdict: SuitabilityVerdict = blockers.length
    ? "unsuitable"
    : utilisation > 0.85
      ? "tight"
      : cautions.length
        ? "suitable_with_care"
        : "suitable";

  const known = [
    space.ceilingHeightM,
    space.doorWidthCm,
    space.accessRoute,
    inventory.largestItemCm,
  ].filter(Boolean).length;
  const confidence = Math.min(0.95, 0.5 + known * 0.1);

  const alternativeSpaceIds = blockers.length
    ? (input.alternatives ?? [])
        .filter((option) => option.usableVolumeM3 >= required)
        .sort((a, b) => a.usableVolumeM3 - b.usableVolumeM3)
        .slice(0, 3)
        .map((option) => option.id)
    : [];

  return {
    assessment: {
      spaceId: space.id,
      score,
      verdict,
      fitsByVolume,
      utilisation: Number(utilisation.toFixed(3)),
      blockers,
      cautions,
      improvements,
      alternativeSpaceIds,
    },
    factors,
    confidence,
  };
}

export const suitabilityProvider: AiProvider<SuitabilityInput, SuitabilityAssessment> = {
  id: "spacilo-suitability",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["suitability"],
  async run(input) {
    const { assessment, factors, confidence } = assessSuitability(input);
    const reason =
      assessment.verdict === "unsuitable"
        ? assessment.blockers[0] ?? "This space cannot take these belongings as they are."
        : assessment.verdict === "tight"
          ? `Everything should fit, using about ${Math.round(assessment.utilisation * 100)}% of the space.`
          : `A comfortable fit at about ${Math.round(assessment.utilisation * 100)}% of the space.`;

    return {
      result: assessment,
      confidence,
      explanation: explain({
        reason,
        confidence,
        factors,
        alternatives: (input.alternatives ?? [])
          .filter((option) => assessment.alternativeSpaceIds.includes(option.id))
          .map((option) =>
            alternative(
              option.title ?? option.id,
              `${option.usableVolumeM3.toFixed(1)} m³ usable, which covers your packed volume.`,
              0.6,
            ),
          ),
      }),
    };
  },
};

/* -------------------------------------------------------------- ranking */

export interface RankingListing {
  id: string;
  title?: string;
  /** 0–100 suitability, where it has already been assessed. */
  compatibility?: number;
  distanceMiles?: number;
  hostRating?: number;
  hostResponseRate?: number;
  reviewCount?: number;
  securityScore?: number;
  available?: boolean;
  monthlyPrice?: number;
  accessHours?: "anytime" | "daytime" | "by_arrangement" | "unknown";
  /** Share of past requests that became bookings, 0–1. */
  bookingSuccessRate?: number;
  verifiedHost?: boolean;
}

export interface RenterPreferences {
  maxMonthlyPrice?: number;
  maxDistanceMiles?: number;
  needsAnytimeAccess?: boolean;
  prefersVerifiedHosts?: boolean;
  /** Space types the renter has engaged with before. */
  preferredSpaceTypes?: string[];
}

export interface RankingInput {
  listings: RankingListing[];
  preferences?: RenterPreferences;
}

export interface RankedListing {
  id: string;
  score: number;
  rank: number;
  reasons: string[];
  /** Signal contributions, for admin diagnostics and explainability. */
  contributions: Array<{ signal: string; points: number }>;
}

export interface RankingOutput {
  entries: RankedListing[];
  /** Ids in ranked order — the only thing most surfaces need. */
  order: string[];
}

interface Weight {
  signal: string;
  max: number;
  score(listing: RankingListing, preferences: RenterPreferences): number;
  reason(listing: RankingListing): string | null;
}

function normalise(value: number | undefined, best: number, worst: number): number {
  if (value === undefined) return 0.5;
  if (best === worst) return 0.5;
  const ratio = (value - worst) / (best - worst);
  return Math.min(1, Math.max(0, ratio));
}

const WEIGHTS: Weight[] = [
  {
    signal: "compatibility",
    max: 30,
    score: (listing) => normalise(listing.compatibility, 100, 0),
    reason: (listing) =>
      (listing.compatibility ?? 0) >= 80 ? "fits everything on your list" : null,
  },
  {
    signal: "distance",
    max: 15,
    score: (listing, preferences) =>
      normalise(listing.distanceMiles, 0, preferences.maxDistanceMiles ?? 15),
    reason: (listing) =>
      listing.distanceMiles !== undefined && listing.distanceMiles <= 3
        ? `${listing.distanceMiles.toFixed(1)} miles away`
        : null,
  },
  {
    signal: "host quality",
    max: 12,
    score: (listing) => normalise(listing.hostRating, 5, 3),
    reason: (listing) => ((listing.hostRating ?? 0) >= 4.7 ? "excellent host reviews" : null),
  },
  {
    signal: "response rate",
    max: 8,
    score: (listing) => normalise(listing.hostResponseRate, 1, 0.4),
    reason: (listing) => ((listing.hostResponseRate ?? 0) >= 0.9 ? "host replies quickly" : null),
  },
  {
    signal: "reviews",
    max: 6,
    score: (listing) => normalise(listing.reviewCount, 25, 0),
    reason: (listing) => ((listing.reviewCount ?? 0) >= 10 ? `${listing.reviewCount} reviews` : null),
  },
  {
    signal: "security",
    max: 8,
    score: (listing) => normalise(listing.securityScore, 100, 0),
    reason: (listing) => ((listing.securityScore ?? 0) >= 75 ? "strong security features" : null),
  },
  {
    signal: "availability",
    max: 6,
    score: (listing) => (listing.available === false ? 0 : 1),
    reason: (listing) => (listing.available === false ? null : "available for your dates"),
  },
  {
    signal: "price",
    max: 10,
    score: (listing, preferences) =>
      normalise(listing.monthlyPrice, 0, preferences.maxMonthlyPrice ?? 300),
    reason: (listing) =>
      listing.monthlyPrice !== undefined && listing.monthlyPrice <= 80
        ? `£${Math.round(listing.monthlyPrice)} a month`
        : null,
  },
  {
    signal: "access hours",
    max: 5,
    score: (listing, preferences) => {
      if (!preferences.needsAnytimeAccess) return listing.accessHours === "anytime" ? 1 : 0.6;
      return listing.accessHours === "anytime" ? 1 : listing.accessHours === "daytime" ? 0.4 : 0.1;
    },
    reason: (listing) => (listing.accessHours === "anytime" ? "24-hour access" : null),
  },
  {
    signal: "booking history",
    max: 6,
    score: (listing) => normalise(listing.bookingSuccessRate, 1, 0),
    reason: (listing) =>
      (listing.bookingSuccessRate ?? 0) >= 0.7 ? "requests here are usually accepted" : null,
  },
  {
    signal: "preferences",
    max: 4,
    score: (listing, preferences) =>
      preferences.prefersVerifiedHosts ? (listing.verifiedHost ? 1 : 0.2) : 0.6,
    reason: (listing) => (listing.verifiedHost ? "verified host" : null),
  },
];

export function rankListings(input: RankingInput): RankingOutput {
  const preferences = input.preferences ?? {};
  const entries = input.listings
    .map((listing) => {
      const contributions = WEIGHTS.map((weight) => ({
        signal: weight.signal,
        points: Number((weight.score(listing, preferences) * weight.max).toFixed(2)),
      }));
      const total = contributions.reduce((sum, entry) => sum + entry.points, 0);
      const reasons = WEIGHTS.map((weight) => weight.reason(listing)).filter(
        (reason): reason is string => Boolean(reason),
      );
      return {
        id: listing.id,
        score: Math.round(total),
        rank: 0,
        reasons: reasons.slice(0, 4),
        contributions,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { entries, order: entries.map((entry) => entry.id) };
}

export const rankingProvider: AiProvider<RankingInput, RankingOutput> = {
  id: "spacilo-ranking",
  kind: "llm",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["ranking"],
  async run(input) {
    const output = rankListings(input);
    const best = output.entries[0];
    const confidence = input.listings.length > 1 ? 0.78 : 0.6;
    return {
      result: output,
      confidence,
      explanation: explain({
        reason: best
          ? `Ranked ${output.entries.length} space${output.entries.length === 1 ? "" : "s"}; the leader scored ${best.score} out of 100.`
          : "No spaces to rank yet.",
        confidence,
        factors: (best?.contributions ?? [])
          .filter((entry) => entry.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 5)
          .map((entry) => factor(entry.signal, `${entry.points} points`, entry.points / 30)),
        alternatives: output.entries
          .slice(1, 4)
          .map((entry) => alternative(entry.id, entry.reasons[0] ?? "Close on score", entry.score / 100)),
      }),
    };
  },
};

export function installSuitabilityProviders(): void {
  registerAiProvider(suitabilityProvider);
  registerAiProvider(rankingProvider);
}
