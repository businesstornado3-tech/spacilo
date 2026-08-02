/**
 * Deterministic component scoring. Component points always sum exactly to the
 * displayed total — no rounding of the total independently of its parts.
 */
import { formatM3 } from "@/lib/spaces";
import {
  ACCESS_POINTS,
  ACCESS_POINTS_UNKNOWN,
  CAPACITY_BANDS,
  CONDITION_POINTS,
  GEOMETRY_POINTS,
  SECURITY_FEATURES,
  SPACEFIT_WEIGHTS,
  UNSPECIFIED_CATEGORY_WEIGHT,
} from "./config";
import { renterCategoryLabel, type CategoryCoverage, type EntranceCheck } from "./rules";
import type { ComponentScore, MatchInventory, MatchSpace } from "./types";
import { accessTypeLabel } from "@/lib/spaces";
import type { AccessTypeValue } from "@/lib/spaces";

export function capacityComponent(
  space: MatchSpace,
  inventory: MatchInventory,
  ratio: number | null,
): ComponentScore {
  const max = SPACEFIT_WEIGHTS.capacity;
  const available = space.estimated_available_volume_m3 === null ? null : Number(space.estimated_available_volume_m3);

  if (ratio === null || available === null) {
    return {
      score: Math.round(max * 0.5),
      max,
      state: "unknown",
      detail: "The host hasn't provided enough size information to estimate capacity fit.",
    };
  }

  const band = CAPACITY_BANDS.find((b) => ratio >= b.min);
  const points = band?.points ?? 0;
  return {
    score: points,
    max,
    state: "pass",
    detail: `Your estimated requirement is ${formatM3(round(inventory.storageRequirementM3))} and this space has approximately ${formatM3(round(available))} estimated available capacity.`,
  };
}

export function itemComponent(coverage: CategoryCoverage): ComponentScore {
  const max = SPACEFIT_WEIGHTS.itemCompatibility;
  const total = coverage.accepted.length + coverage.unspecified.length;
  if (total === 0) {
    return { score: max, max, state: "unknown", detail: "No confirmed item categories to check.", };
  }
  const weighted = coverage.accepted.length + coverage.unspecified.length * UNSPECIFIED_CATEGORY_WEIGHT;
  const score = Math.round((weighted / total) * max);

  if (coverage.unspecified.length === 0) {
    return { score, max, state: "pass", detail: "All your confirmed item categories are accepted." };
  }
  return {
    score,
    max,
    state: "unknown",
    detail: `The host hasn't said whether they accept ${coverage.unspecified.map(renterCategoryLabel).join(", ")}.`,
  };
}

export function conditionsComponent(space: MatchSpace): ComponentScore {
  const max = SPACEFIT_WEIGHTS.conditions;
  const features = space.features ?? [];
  const dry = features.includes("dry") || space.moisture_condition === "dry";
  const indoor = features.includes("indoor") || space.temperature_condition === "normal_indoor";
  const lockable = features.includes("lockable");
  const security = features.some((f) => SECURITY_FEATURES.includes(f));

  let score = 0;
  const parts: string[] = [];
  if (dry) {
    score += CONDITION_POINTS.dry;
    parts.push("dry");
  }
  if (indoor) {
    score += CONDITION_POINTS.indoor;
    parts.push("indoor");
  }
  if (lockable) {
    score += CONDITION_POINTS.lockable;
    parts.push("lockable");
  }
  if (security) {
    score += CONDITION_POINTS.security;
    parts.push("added security features");
  }

  return {
    score,
    max,
    state: features.length === 0 ? "unknown" : "pass",
    detail:
      parts.length > 0
        ? `Host-declared: ${parts.join(", ")}.`
        : "The host hasn't declared storage conditions such as dry, indoor or lockable.",
  };
}

export function accessComponent(space: MatchSpace): ComponentScore {
  const max = SPACEFIT_WEIGHTS.access;
  const type = space.access_type;
  if (!type) {
    return {
      score: ACCESS_POINTS_UNKNOWN,
      max,
      state: "unknown",
      detail: "The host hasn't described their access arrangement.",
    };
  }
  return {
    score: ACCESS_POINTS[type] ?? ACCESS_POINTS_UNKNOWN,
    max,
    state: "pass",
    detail: `${accessTypeLabel(type as AccessTypeValue)}.`,
  };
}

export function geometryComponent(entrance: EntranceCheck): ComponentScore {
  const max = SPACEFIT_WEIGHTS.geometry;
  if (entrance.state === "pass") {
    return {
      score: GEOMETRY_POINTS.fits,
      max,
      state: "pass",
      detail: `Entrance is ${entrance.doorWidthCm} × ${entrance.doorHeightCm} cm — your items should pass through.`,
    };
  }
  return {
    score: GEOMETRY_POINTS.unknown,
    max,
    state: "unknown",
    detail: "Entrance dimensions haven't been provided by the host.",
  };
}

/** Confidence in the assessment — NOT a host quality or trust rating. */
export function completenessComponent(space: MatchSpace): ComponentScore {
  const max = SPACEFIT_WEIGHTS.completeness;
  const checks = [
    space.estimated_available_volume_m3 !== null,
    (space.accepted_categories ?? []).length > 0,
    (space.features ?? []).length > 0,
    Boolean(space.access_type),
    (space.photo_count ?? 0) > 0,
  ];
  const score = checks.filter(Boolean).length;
  const missing = checks.length - score;
  return {
    score: Math.min(score, max),
    max,
    state: missing === 0 ? "pass" : "unknown",
    detail:
      missing === 0
        ? "The host has provided the information needed for a confident assessment."
        : `${missing} piece${missing === 1 ? "" : "s"} of listing information ${missing === 1 ? "is" : "are"} missing, which lowers match confidence.`,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;
