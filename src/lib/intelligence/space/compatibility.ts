/**
 * Milestone 12 — booking compatibility, extended with space intelligence.
 *
 * The existing planner score answers "do these belongings fit?". This answers
 * "is this space a sensible place to put them?" — and keeps the two separate
 * so a good pack in an awkward space still reads honestly.
 */
import type {
  AccessAnalysis,
  SpaceAnalysisInput,
  SpaceCompatibility,
  SpaceHealth,
  SpaceOptimisation,
  SpaceSuitability,
  SuitabilityRating,
  SuitabilityUse,
  UsableSpace,
} from "./contracts";
import { clamp01 } from "./geometry";

const RATING_ORDER: SuitabilityRating[] = ["unsuitable", "limited", "suitable", "ideal"];

function worst(ratings: SuitabilityRating[]): SuitabilityRating {
  return ratings.reduce<SuitabilityRating>(
    (lowest, rating) =>
      RATING_ORDER.indexOf(rating) < RATING_ORDER.indexOf(lowest) ? rating : lowest,
    "ideal",
  );
}

export interface CompatibilityInput {
  /** What the renter intends to store. Empty means a general household mix. */
  uses?: SuitabilityUse[];
  /** Volume the renter needs, in m³. */
  requiredVolumeM3?: number;
}

export function assessSpaceCompatibility(
  input: SpaceAnalysisInput,
  usable: UsableSpace,
  access: AccessAnalysis,
  suitability: SpaceSuitability[],
  optimisation: SpaceOptimisation,
  health: SpaceHealth,
  request: CompatibilityInput = {},
): SpaceCompatibility {
  const uses = request.uses?.length ? request.uses : (["boxes", "furniture"] as SuitabilityUse[]);
  const matched = suitability.filter((entry) => uses.includes(entry.use));
  const matchedScore =
    matched.length === 0
      ? 60
      : Math.round(matched.reduce((sum, entry) => sum + entry.score, 0) / matched.length);

  const requiredVolumeM3 = request.requiredVolumeM3 ?? 0;
  const fit =
    requiredVolumeM3 === 0 ? 1 : clamp01(usable.availableVolumeM3 / Math.max(0.1, requiredVolumeM3));

  const spaceScore = Math.max(
    0,
    Math.min(100, Math.round(0.45 * optimisation.aiScore + 0.35 * matchedScore + 0.2 * fit * 100)),
  );

  // How well the host has prepared and described the space, from declared
  // facts only — never from reviews or marketing copy.
  const features = input.features ?? [];
  const hostScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 *
          clamp01(
            0.3 * (input.hostConfirmed ? 1 : 0.45) +
              0.25 * clamp01(features.length / 4) +
              0.25 * (health.organisation / 100) +
              0.2 * (health.accessibility / 100),
          ),
      ),
    ),
  );

  const risk: SpaceCompatibility["risk"] =
    fit < 0.85 || access.access === "restricted"
      ? "high"
      : matchedScore < 60 || access.access === "difficult"
        ? "medium"
        : "low";

  const packingComplexity: SpaceCompatibility["packingComplexity"] =
    access.access === "easy" && fit >= 1.2
      ? "Easy"
      : access.access === "restricted" || fit < 0.95
        ? "Involved"
        : "Moderate";

  const reasons: string[] = [
    `${usable.availableVolumeM3}m³ available against ${requiredVolumeM3 || "an unstated"}m³ required.`,
    `Access rated ${access.access}, loading rated ${access.loading}.`,
    ...matched.map((entry) => `${entry.label}: ${entry.rating} (${entry.score}/100).`),
  ];

  return {
    spaceScore,
    hostScore,
    suitability: matched.length === 0 ? "suitable" : worst(matched.map((entry) => entry.rating)),
    accessibility: access.access,
    risk,
    packingComplexity,
    futureCapacityM3: optimisation.remainingVolumeM3,
    reasons,
  };
}
