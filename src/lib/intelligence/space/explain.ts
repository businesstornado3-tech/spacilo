/**
 * Milestone 13 — space explainability.
 *
 * Every figure the engine produces can explain itself in one plain sentence.
 * Nothing here invents a fact: each line names the number it came from.
 */
import type {
  AccessAnalysis,
  HostRecommendation,
  PlacementProposal,
  SpaceHealth,
  SpaceOptimisation,
  SpaceSuitability,
  StorageZone,
  UsableSpace,
} from "./contracts";
import { explainPlacement } from "./placement";

export function explainUsableSpace(usable: UsableSpace): string[] {
  const lines = [
    `Usable floor is ${usable.usableFloorAreaM2}m² of ${usable.totalFloorAreaM2}m², after ${usable.blockedAreaM2}m² blocked and ${usable.walkableAreaM2}m² kept walkable.`,
    `Available volume is ${usable.availableVolumeM3}m³ once stacking height and access are honoured.`,
  ];
  if (usable.ceilingVolumeM3 > 0.5) {
    lines.push(`${usable.ceilingVolumeM3}m³ sits above safe stacking height and is not counted.`);
  }
  if (usable.wallCapacityM2 > 2) {
    lines.push(`${usable.wallCapacityM2}m² of wall could carry mounts rather than floor storage.`);
  }
  return lines;
}

export function explainAccess(access: AccessAnalysis): string[] {
  return [
    `Access rated ${access.access}: the opening is ${access.doorWidthM}m wide and ${access.doorHeightM}m high.`,
    `Nothing wider than ${access.largestItemM.widthM}m or taller than ${access.largestItemM.heightM}m will pass without dismantling.`,
    ...access.notes,
  ];
}

export function explainZone(zone: StorageZone): string {
  return `${zone.label} placed at ${zone.areaM2}m² (${zone.volumeM3}m³) because ${zone.reason.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "")}.`;
}

export function explainSuitability(entry: SpaceSuitability): string {
  const because = entry.reasons[0] ?? entry.cautions[0] ?? "geometry and access were assessed";
  return `${entry.label}: ${entry.rating} (${entry.score}/100) — ${because.replace(/^[A-Z]/, (c) => c.toLowerCase())}`;
}

export function explainHostRecommendation(entry: HostRecommendation): string {
  return `${entry.action} — ${entry.reason} ${entry.evidence.join(" ")}`.trim();
}

export function explainHealth(health: SpaceHealth, optimisation: SpaceOptimisation): string[] {
  return [
    `Space health is ${health.overall}/100 (${health.band.replace("_", " ")}).`,
    `Efficiency ${health.efficiency}% and accessibility ${health.accessibility}% carry most of that figure.`,
    `Dead space is ${health.deadSpace}% of the volume, with ${optimisation.expansionVolumeM3}m³ recoverable.`,
  ];
}

/** The engine's headline narrative, assembled from the stages above. */
export function buildExplanations(input: {
  usable: UsableSpace;
  access: AccessAnalysis;
  zones: StorageZone[];
  suitability: SpaceSuitability[];
  placements: PlacementProposal[];
  health: SpaceHealth;
  optimisation: SpaceOptimisation;
}): string[] {
  return [
    ...explainUsableSpace(input.usable),
    ...explainAccess(input.access),
    ...input.zones.slice(0, 4).map(explainZone),
    ...input.suitability.slice(0, 3).map(explainSuitability),
    ...input.placements.slice(0, 4).map(explainPlacement),
    ...explainHealth(input.health, input.optimisation),
  ];
}
