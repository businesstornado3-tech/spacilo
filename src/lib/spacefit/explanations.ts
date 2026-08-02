/**
 * Renter-facing explanations, generated only from deterministic rule output.
 * Never state a claim that isn't backed by stored host or renter data.
 */
import { formatM3 } from "@/lib/spaces";
import { CAPACITY_BANDS } from "./config";
import type { CategoryCoverage, EntranceCheck } from "./rules";
import { renterCategoryLabel } from "./rules";
import type { ComponentKey, ComponentScore, MatchSpace } from "./types";

export interface Explanations {
  positives: string[];
  warnings: string[];
}

export function buildExplanations(
  space: MatchSpace,
  components: Record<ComponentKey, ComponentScore>,
  coverage: CategoryCoverage,
  entrance: EntranceCheck,
  capacityRatio: number | null,
): Explanations {
  const positives: string[] = [];
  const warnings: string[] = [];

  // Capacity
  if (capacityRatio !== null) {
    const band = CAPACITY_BANDS.find((b) => capacityRatio >= b.min);
    if (band) {
      if (band.band === "very_tight" || band.band === "tight") warnings.push(band.label);
      else positives.push(band.label);
    }
  } else {
    warnings.push("Estimated available capacity hasn't been provided");
  }

  // Items
  if (coverage.rejected.length === 0 && coverage.unspecified.length === 0 && coverage.accepted.length > 0) {
    positives.push("All your item types are accepted");
  }
  if (coverage.unspecified.length > 0) {
    warnings.push(
      `Host hasn't confirmed they accept ${coverage.unspecified.map(renterCategoryLabel).join(", ")}`,
    );
  }

  // Conditions — host-declared only.
  const features = space.features ?? [];
  const dry = features.includes("dry") || space.moisture_condition === "dry";
  const indoor = features.includes("indoor") || space.temperature_condition === "normal_indoor";
  const lockable = features.includes("lockable");
  if (dry && indoor) positives.push("Dry indoor storage (host-declared)");
  else if (dry) positives.push("Dry storage (host-declared)");
  else if (indoor) positives.push("Indoor storage (host-declared)");
  if (lockable) positives.push("Lockable space (host-declared)");
  if (!dry && !indoor && !lockable) warnings.push("Storage conditions haven't been declared");

  // Access
  if (components.access.state === "pass") positives.push(components.access.detail.replace(/\.$/, ""));
  else warnings.push("Access arrangement hasn't been described");

  // Entrance
  if (entrance.state === "pass") positives.push("Entrance size should suit your items");
  else warnings.push("Entrance size hasn't been provided");

  // Completeness
  if (components.completeness.state === "unknown") {
    warnings.push("Some listing information is missing, so this estimate is less certain");
  }

  return { positives, warnings };
}

/** Short capacity sentence reused on cards and the breakdown. */
export function capacitySentence(availableM3: number | null, requirementM3: number) {
  if (availableM3 === null) return "Estimated available capacity hasn't been provided.";
  return `Estimated requirement ${formatM3(requirementM3)} · estimated available ${formatM3(availableM3)}.`;
}

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  capacity: "Capacity",
  itemCompatibility: "Items",
  conditions: "Conditions",
  access: "Access",
  geometry: "Entrance",
  completeness: "Match information",
};
