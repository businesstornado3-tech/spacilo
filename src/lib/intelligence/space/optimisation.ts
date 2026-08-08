/**
 * Milestone 9 + 14 — optimisation and health diagnostics.
 *
 * Two views of the same facts: what the space could still take, and how well
 * it is set up right now. Both are deterministic functions of the analysis.
 */
import type {
  AccessAnalysis,
  Obstacle,
  RoomGeometry,
  SpaceHealth,
  SpaceOptimisation,
  StorageZone,
  UsableSpace,
} from "./contracts";
import { clamp01, round2 } from "./geometry";
import { zoneCapacityM3 } from "./zones";

const ACCESS_VALUE: Record<AccessAnalysis["access"], number> = {
  easy: 1,
  moderate: 0.78,
  difficult: 0.5,
  restricted: 0.25,
};

export function optimiseSpace(
  geometry: RoomGeometry,
  usable: UsableSpace,
  zones: StorageZone[],
  access: AccessAnalysis,
  occupiedVolumeM3 = 0,
): SpaceOptimisation {
  const rawVolumeM3 = round2(
    geometry.floor.areaM2 * geometry.ceiling.heightM,
  );
  const maximumCapacityM3 = zoneCapacityM3(zones);
  const remainingVolumeM3 = round2(Math.max(0, usable.availableVolumeM3));

  // What better shelving and overhead use could still unlock.
  const expansionVolumeM3 = round2(
    Math.max(0, usable.ceilingVolumeM3 * 0.6 + usable.deadSpaceM3 * 0.25),
  );

  const packingDensity =
    maximumCapacityM3 === 0
      ? 0
      : Math.round(clamp01(occupiedVolumeM3 / maximumCapacityM3) * 100) / 100;
  const spaceEfficiency =
    rawVolumeM3 === 0 ? 0 : Math.round(clamp01(usable.availableVolumeM3 / rawVolumeM3) * 100) / 100;

  const unusedAreas: string[] = [];
  if (usable.ceilingVolumeM3 > 1) {
    unusedAreas.push(`${usable.ceilingVolumeM3}m³ above stacking height is unused.`);
  }
  if (usable.wallCapacityM2 > 4) {
    unusedAreas.push(`${usable.wallCapacityM2}m² of wall could carry mounts or racking.`);
  }
  if (usable.blockedAreaM2 > 0.5) {
    unusedAreas.push(`${usable.blockedAreaM2}m² of floor is blocked by fixed features.`);
  }

  const aiScore = Math.round(
    100 *
      (0.35 * spaceEfficiency +
        0.25 * ACCESS_VALUE[access.access] +
        0.2 * clamp01(usable.storageDensity) +
        0.2 * clamp01(1 - usable.deadSpaceM3 / Math.max(1, rawVolumeM3))),
  );

  return {
    remainingVolumeM3,
    expansionVolumeM3,
    maximumCapacityM3,
    packingDensity,
    spaceEfficiency,
    unusedAreas,
    aiScore: Math.max(0, Math.min(100, aiScore)),
  };
}

export function diagnoseHealth(
  usable: UsableSpace,
  optimisation: SpaceOptimisation,
  access: AccessAnalysis,
  zones: StorageZone[],
  obstacles: Obstacle[],
  occupiedVolumeM3 = 0,
): SpaceHealth {
  const capacity = Math.max(1, optimisation.maximumCapacityM3);
  const utilisation = Math.round(clamp01(occupiedVolumeM3 / capacity) * 100);
  const deadSpace = Math.round(
    clamp01(usable.deadSpaceM3 / Math.max(1, usable.deadSpaceM3 + usable.availableVolumeM3)) * 100,
  );
  const accessibility = Math.round(ACCESS_VALUE[access.access] * 100);
  const expansionPotential = Math.round(
    clamp01(optimisation.expansionVolumeM3 / Math.max(1, capacity)) * 100,
  );

  // Organisation reads from the plan itself: purposeful zones, a preserved
  // access route, and few unremovable obstructions.
  const hasAccessZone = zones.some((zone) => zone.kind === "access");
  const fixedObstacles = obstacles.filter((obstacle) => !obstacle.removable).length;
  const organisation = Math.round(
    100 *
      clamp01(
        0.4 * clamp01(zones.length / 8) +
          0.35 * (hasAccessZone ? 1 : 0.4) +
          0.25 * clamp01(1 - fixedObstacles * 0.2),
      ),
  );

  const efficiency = Math.round(optimisation.spaceEfficiency * 100);

  const overall = Math.round(
    0.25 * accessibility + 0.25 * efficiency + 0.2 * organisation + 0.2 * (100 - deadSpace) + 0.1 * utilisation,
  );

  const band: SpaceHealth["band"] =
    overall >= 80 ? "excellent" : overall >= 65 ? "good" : overall >= 45 ? "fair" : "needs_work";

  return {
    utilisation,
    deadSpace,
    accessibility,
    expansionPotential,
    organisation,
    efficiency,
    overall: Math.max(0, Math.min(100, overall)),
    band,
  };
}
