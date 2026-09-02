/**
 * Milestone 10 — digital twin construction.
 *
 * Contracts only, filled with real geometry. No renderer, no Three.js, no
 * meshes: a future 3D or AR layer reads `surfaces`, `zones` and `objects` and
 * draws them, and nothing in this file has to change when it does.
 */
import type {
  DigitalTwin,
  Obstacle,
  RoomGeometry,
  Shelf,
  StorageSpace,
  StorageZone,
  TwinHistoryEntry,
  TwinMeasurements,
  TwinObject,
  TwinSurface,
  TwinZone,
  UsableSpace,
} from "./contracts";
import { SPACE_CONTRACT_VERSION } from "./contracts";
import { round2 } from "./geometry";

export const SPACE_ENGINE_ID = "earnroom-space-engine";
export const SPACE_ENGINE_VERSION = "1.0";

function surfaces(space: StorageSpace, geometry: RoomGeometry): TwinSurface[] {
  const list: TwinSurface[] = [
    {
      id: `${space.id}-floor`,
      kind: "floor",
      side: null,
      rect: { x: 0, y: 0, w: geometry.floor.widthM, d: geometry.floor.depthM },
      mountable: false,
    },
    {
      id: `${space.id}-ceiling`,
      kind: "ceiling",
      side: null,
      rect: { x: 0, y: 0, w: geometry.floor.widthM, d: geometry.floor.depthM },
      mountable: geometry.ceiling.supportsOverhead,
    },
  ];

  for (const wall of geometry.walls) {
    list.push({
      id: `${space.id}-wall-${wall.side}`,
      kind: "wall",
      side: wall.side,
      // Walls are given as elevations: `w` along the wall, `d` its height.
      rect: { x: 0, y: 0, w: wall.lengthM, d: wall.heightM },
      mountable: wall.mountable,
    });
  }

  for (const door of geometry.doors) {
    list.push({
      id: door.id,
      kind: "door",
      side: door.side,
      rect: {
        x: round2(Math.max(0, (geometry.floor.widthM - door.widthM) / 2)),
        y: 0,
        w: door.widthM,
        d: door.heightM,
      },
      mountable: false,
    });
  }

  return list;
}

function twinZones(zones: StorageZone[]): TwinZone[] {
  return zones.map((zone) => ({
    id: zone.id,
    kind: zone.kind,
    label: zone.label,
    rect: zone.footprint,
    heightM: zone.heightM,
  }));
}

function fixedObjects(obstacles: Obstacle[], shelves: Shelf[], zones: StorageZone[]): TwinObject[] {
  const shelvingZone = zones.find((zone) => zone.kind === "shelving");

  const fromObstacles: TwinObject[] = obstacles.map((obstacle) => ({
    id: obstacle.id,
    label: obstacle.label,
    modelKey: `obstacle:${obstacle.kind}`,
    position: { x: obstacle.footprint.x, y: obstacle.footprint.y },
    sizeM: {
      widthM: obstacle.footprint.w,
      depthM: obstacle.footprint.d,
      heightM: round2(Math.max(0, obstacle.toHeightM - obstacle.fromHeightM)),
    },
    elevationM: obstacle.fromHeightM,
    rotationDeg: 0,
    zoneId: null,
    fixed: !obstacle.removable,
  }));

  const fromShelves: TwinObject[] = shelves.map((shelf) => ({
    id: shelf.id,
    label: `Shelving (${shelf.levels} levels)`,
    modelKey: "fixture:shelving",
    position: { x: 0, y: 0 },
    sizeM: { widthM: shelf.depthM, depthM: shelf.lengthM, heightM: round2(shelf.levels * 0.45) },
    elevationM: 0,
    rotationDeg: shelf.side === "back" ? 0 : 90,
    zoneId: shelvingZone?.id ?? null,
    fixed: false,
  }));

  return [...fromObstacles, ...fromShelves];
}

export function buildDigitalTwin(
  space: StorageSpace,
  geometry: RoomGeometry,
  zones: StorageZone[],
  obstacles: Obstacle[],
  shelves: Shelf[],
  usable: UsableSpace,
  options: { hostConfirmed?: boolean; confidence: number; generatedAt: number },
): DigitalTwin {
  const measurements: TwinMeasurements = {
    widthM: geometry.floor.widthM,
    depthM: geometry.floor.depthM,
    heightM: geometry.ceiling.heightM,
    floorAreaM2: geometry.floor.areaM2,
    volumeM3: round2(geometry.floor.areaM2 * geometry.ceiling.heightM),
    usableVolumeM3: usable.availableVolumeM3,
    source: options.hostConfirmed ? "host_confirmed" : "ai_proposed",
  };

  const history: TwinHistoryEntry[] = [
    {
      at: options.generatedAt,
      change: "twin_generated",
      by: "engine",
      detail: `${zones.length} zones, ${obstacles.length} obstacles.`,
    },
  ];
  if (options.hostConfirmed) {
    history.push({
      at: options.generatedAt,
      change: "host_confirmed_measurements",
      by: "host",
    });
  }

  return {
    metadata: {
      spaceId: space.id,
      spaceKind: space.kind,
      contractVersion: SPACE_CONTRACT_VERSION,
      generatedAt: options.generatedAt,
      engine: `${SPACE_ENGINE_ID}-${SPACE_ENGINE_VERSION}`,
      confidence: options.confidence,
    },
    measurements,
    surfaces: surfaces(space, geometry),
    zones: twinZones(zones),
    objects: fixedObjects(obstacles, shelves, zones),
    history,
  };
}

/** Appends a history entry without mutating the twin. */
export function recordTwinChange(twin: DigitalTwin, entry: TwinHistoryEntry): DigitalTwin {
  return { ...twin, history: [...twin.history, entry] };
}
