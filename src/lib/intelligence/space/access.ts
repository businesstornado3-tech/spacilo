/**
 * Milestone 5 — access analysis.
 *
 * How hard is it to get things in and out? Everything here is derived from the
 * opening, the ceiling, the walkway and the obstacles that intrude on the
 * route — never from marketing copy about the space.
 */
import { walkwayDepth } from "@/lib/spaceplanner/spaces";

import type {
  AccessAnalysis,
  AccessDifficulty,
  AccessZone,
  LoadingZone,
  Obstacle,
  ParkingZone,
  RoomGeometry,
  StorageSpace,
  Walkway,
} from "./contracts";
import { round1, round2 } from "./geometry";

/** The access strip kept clear in front of the opening. */
export function buildWalkways(space: StorageSpace, geometry: RoomGeometry): Walkway[] {
  const depth = walkwayDepth(space);
  if (depth <= 0) return [];
  const widthM = round2(Math.min(space.width, Math.max(0.7, space.doorWidth)));
  return [
    {
      id: `${space.id}-walkway`,
      footprint: {
        x: round2((space.width - widthM) / 2),
        y: round2(Math.max(0, geometry.floor.depthM - depth)),
        w: widthM,
        d: round2(depth),
      },
      widthM,
      trolleyFriendly: widthM >= 0.9 && geometry.floor.surface !== "stepped",
    },
  ];
}

export function buildAccessZones(space: StorageSpace, walkways: Walkway[]): AccessZone[] {
  const door = `${space.id}-door`;
  return walkways.map((walkway) => ({
    id: `${walkway.id}-access`,
    footprint: walkway.footprint,
    widthM: walkway.widthM,
    connectsDoorId: door,
  }));
}

export function buildParkingZones(space: StorageSpace, geometry: RoomGeometry): ParkingZone[] {
  const drivable = space.kind === "parking" || space.kind === "garage" || space.kind === "commercial";
  if (!drivable) return [];
  const clearance = Math.min(geometry.ceiling.minHeightM, geometry.doors[0]?.heightM ?? 2);
  const suits: ParkingZone["suits"] = ["bicycle", "motorcycle"];
  if (space.width >= 2.3 && space.depth >= 4.5 && clearance >= 1.9) suits.push("car");
  if (space.depth >= 5 && clearance >= 2.1) suits.push("van", "trailer");
  return [
    {
      id: `${space.id}-parking`,
      footprint: { x: 0, y: 0, w: space.width, d: space.depth },
      heightClearanceM: round2(clearance),
      suits,
    },
  ];
}

export function buildLoadingZones(space: StorageSpace): LoadingZone[] {
  const carry =
    space.kind === "loft" ? 14 : space.kind === "bedroom" || space.kind === "storage_room" ? 12 : 5;
  return [
    {
      id: `${space.id}-loading`,
      footprint: { x: 0, y: round2(space.depth), w: space.width, d: 2 },
      carryDistanceM: carry,
      stepFree: space.kind !== "loft" && space.kind !== "bedroom" && space.kind !== "shed",
    },
  ];
}

function grade(score: number): AccessDifficulty {
  if (score >= 0.8) return "easy";
  if (score >= 0.6) return "moderate";
  if (score >= 0.4) return "difficult";
  return "restricted";
}

export function analyseAccess(
  space: StorageSpace,
  geometry: RoomGeometry,
  obstacles: Obstacle[],
  walkways: Walkway[],
  loading: LoadingZone[],
): AccessAnalysis {
  const door = geometry.doors[0];
  const doorWidthM = door?.widthM ?? space.doorWidth;
  const doorHeightM = door?.heightM ?? 2;
  const walkwayWidthM = walkways[0]?.widthM ?? 0;
  const ceilingClearanceM = geometry.ceiling.minHeightM;

  // A long item has to swing through the opening: the clear floor needed is
  // roughly the opening plus the walkway it turns in.
  const turningRadiusM = round2(Math.max(1, doorWidthM * 0.6 + walkwayWidthM * 0.6));

  const blockingRoute = obstacles.filter(
    (obstacle) => obstacle.fromHeightM < 1.2 && obstacle.footprint.d > 0.1,
  ).length;

  const accessScore =
    0.35 * Math.min(1, doorWidthM / 2.2) +
    0.2 * Math.min(1, doorHeightM / 2.1) +
    0.2 * Math.min(1, walkwayWidthM / 1) +
    0.15 * Math.min(1, ceilingClearanceM / 2.4) +
    0.1 * Math.max(0, 1 - blockingRoute * 0.25);

  const zone = loading[0];
  const loadingScore =
    0.5 * Math.max(0, 1 - (zone ? zone.carryDistanceM / 20 : 0.5)) +
    0.3 * (zone?.stepFree ? 1 : 0.3) +
    0.2 * (geometry.floor.surface === "level" ? 1 : 0.5);

  const route: string[] = [
    zone?.stepFree ? "Step-free from the kerb or driveway" : "Steps between the kerb and the door",
    `Carry about ${zone ? Math.round(zone.carryDistanceM) : 5}m to the opening`,
    `${door?.kind === "hatch" ? "Hatch" : "Opening"} ${round1(doorWidthM)}m wide × ${round1(doorHeightM)}m high`,
    walkwayWidthM > 0
      ? `${round1(walkwayWidthM)}m access strip kept clear to the back wall`
      : "No dedicated access strip — load from the opening",
  ];

  const notes: string[] = [];
  if (doorWidthM < 0.9) notes.push("Wide furniture will not pass the opening without dismantling.");
  if (ceilingClearanceM < 2) notes.push("Tall items may not stand upright throughout.");
  if (walkwayWidthM > 0 && walkwayWidthM < 0.9) {
    notes.push("The access strip is too narrow for a sack barrow.");
  }
  if (blockingRoute > 0) {
    notes.push(`${blockingRoute} fixed obstacle${blockingRoute === 1 ? "" : "s"} narrow the route.`);
  }

  return {
    doorWidthM: round2(doorWidthM),
    doorHeightM: round2(doorHeightM),
    turningRadiusM,
    walkwayWidthM: round2(walkwayWidthM),
    ceilingClearanceM: round2(ceilingClearanceM),
    access: grade(accessScore),
    loading: grade(loadingScore),
    route,
    largestItemM: {
      widthM: round2(Math.max(0, doorWidthM - 0.05)),
      heightM: round2(Math.max(0, Math.min(doorHeightM, ceilingClearanceM) - 0.05)),
    },
    notes,
  };
}
