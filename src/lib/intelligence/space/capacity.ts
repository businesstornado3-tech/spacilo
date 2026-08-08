/**
 * Milestone 4 — usable space calculator.
 *
 * Every figure is derived from the room model and the obstacles in it. Nothing
 * here is a survey: the outputs feed estimates that a host confirms.
 */
import { MAX_STACK_HEIGHT_M, USABLE_VOLUME_FACTOR } from "@/lib/spaceplanner/spaces";

import type { Obstacle, RoomGeometry, StorageSpace, UsableSpace, Walkway } from "./contracts";
import { obstacleFloorArea, round2 } from "./geometry";

export function calculateUsableSpace(
  space: StorageSpace,
  geometry: RoomGeometry,
  obstacles: Obstacle[],
  walkways: Walkway[],
  occupiedVolumeM3 = 0,
): UsableSpace {
  const totalFloorAreaM2 = geometry.floor.areaM2;

  const blockedAreaM2 = round2(
    Math.min(
      totalFloorAreaM2,
      obstacles.reduce((sum, obstacle) => sum + obstacleFloorArea(obstacle), 0),
    ),
  );
  const walkableAreaM2 = round2(
    walkways.reduce((sum, walkway) => sum + walkway.footprint.w * walkway.footprint.d, 0),
  );
  const usableFloorAreaM2 = round2(
    Math.max(0, totalFloorAreaM2 - blockedAreaM2 - walkableAreaM2),
  );

  const wallCapacityM2 = round2(
    geometry.walls
      .filter((wall) => wall.mountable)
      .reduce((sum, wall) => sum + wall.usableAreaM2, 0),
  );

  // Only the band above stacking height counts as ceiling volume: below that,
  // it is ordinary storage volume already.
  const stackHeightM = Math.min(geometry.ceiling.minHeightM, MAX_STACK_HEIGHT_M);
  const ceilingVolumeM3 = round2(
    Math.max(0, geometry.ceiling.heightM - stackHeightM) * usableFloorAreaM2,
  );

  const availableVolumeM3 = round2(
    Math.max(0, usableFloorAreaM2 * stackHeightM * USABLE_VOLUME_FACTOR - occupiedVolumeM3),
  );

  const rawVolumeM3 = round2(space.width * space.depth * geometry.ceiling.heightM);
  const deadSpaceM3 = round2(
    Math.max(0, rawVolumeM3 - availableVolumeM3 - occupiedVolumeM3 - ceilingVolumeM3),
  );

  const storageDensity =
    rawVolumeM3 === 0 ? 0 : Math.round(((availableVolumeM3 + occupiedVolumeM3) / rawVolumeM3) * 100) / 100;

  // What a realistic pack occupies once gangways and stack limits are honoured.
  const futureOccupancyM3 = round2((availableVolumeM3 + occupiedVolumeM3) * 0.85);

  return {
    totalFloorAreaM2,
    usableFloorAreaM2,
    blockedAreaM2,
    walkableAreaM2,
    wallCapacityM2,
    ceilingVolumeM3,
    availableVolumeM3,
    deadSpaceM3,
    storageDensity,
    futureOccupancyM3,
  };
}
