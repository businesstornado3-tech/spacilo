/**
 * Milestone 2 + 6 — geometry and obstacle derivation.
 *
 * A `StorageSpace` carries only width, depth, height and a door width. This
 * module turns that into the full room model the rest of the engine reasons
 * about, and proposes the obstacles typical of each UK space type when the
 * host has not confirmed their own. Deterministic: the same space always
 * produces the same room.
 */
import { hashString } from "@/lib/vision/hash";

import type {
  CeilingGeometry,
  DoorGeometry,
  FloorGeometry,
  Obstacle,
  ObstacleKind,
  RoomGeometry,
  Shelf,
  SpaceKind,
  StorageSpace,
  WallGeometry,
} from "./contracts";

export const round2 = (value: number) => Math.round(value * 100) / 100;
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Stable pseudo-random integer for a space, so proposals never flicker. */
export function spaceSeed(space: StorageSpace, salt: string): number {
  return hashString(`${space.id}:${space.kind}:${salt}`);
}

const PITCHED: SpaceKind[] = ["loft"];
const MOUNTABLE_WALLS: SpaceKind[] = [
  "garage",
  "container",
  "warehouse",
  "commercial",
  "storage_room",
  "shed",
];
const OUTDOOR: SpaceKind[] = ["parking"];

function doorKind(space: StorageSpace): DoorGeometry["kind"] {
  if (space.kind === "loft") return "hatch";
  if (space.kind === "parking") return "open";
  if (space.doorWidth >= 2.2) return "roller";
  if (space.doorWidth >= 1.4) return "double";
  return "single";
}

export function buildFloor(space: StorageSpace): FloorGeometry {
  const sloped = space.kind === "parking";
  const stepped = space.kind === "loft" || space.kind === "shed";
  return {
    widthM: space.width,
    depthM: space.depth,
    areaM2: round2(space.width * space.depth),
    surface: sloped ? "sloped" : stepped ? "stepped" : "level",
    loadBearing: space.kind !== "loft",
  };
}

export function buildCeiling(space: StorageSpace): CeilingGeometry {
  const pitched = PITCHED.includes(space.kind);
  return {
    heightM: space.height,
    minHeightM: pitched ? round2(space.height * 0.6) : space.height,
    pitched,
    supportsOverhead: !pitched && space.height >= 2.4 && space.kind !== "parking",
  };
}

export function buildDoors(space: StorageSpace): DoorGeometry[] {
  const kind = doorKind(space);
  const heightM =
    kind === "hatch" ? 0.8 : kind === "roller" ? round2(Math.min(space.height - 0.2, 2.4)) : 2;
  return [
    {
      id: `${space.id}-door`,
      side: "front",
      widthM: space.doorWidth,
      heightM,
      kind,
      swingClearanceM: kind === "single" || kind === "double" ? 0.9 : 0.4,
    },
  ];
}

export function buildWalls(space: StorageSpace): WallGeometry[] {
  const mountable = MOUNTABLE_WALLS.includes(space.kind);
  const doorArea = space.doorWidth * Math.min(2, space.height);
  const wall = (
    side: WallGeometry["side"],
    lengthM: number,
    subtract: number,
  ): WallGeometry => ({
    side,
    lengthM,
    heightM: space.height,
    usableAreaM2: round2(Math.max(0, lengthM * space.height - subtract)),
    mountable: mountable && side !== "front",
  });

  return [
    wall("back", space.width, 0),
    wall("left", space.depth, 0),
    wall("right", space.depth, 0),
    wall("front", space.width, doorArea),
  ];
}

export function buildGeometry(space: StorageSpace): RoomGeometry {
  return {
    floor: buildFloor(space),
    walls: buildWalls(space),
    ceiling: buildCeiling(space),
    doors: buildDoors(space),
  };
}

/* ------------------------------------------------------------ obstacles */

interface ObstacleTemplate {
  kind: ObstacleKind;
  label: string;
  /** Footprint as a share of the space, so it scales with any geometry. */
  widthShare: number;
  depthShare: number;
  fromHeightShare: number;
  toHeightShare: number;
  removable: boolean;
  reason: string;
}

const TEMPLATES: Record<SpaceKind, ObstacleTemplate[]> = {
  garage: [
    {
      kind: "shelving",
      label: "Wall shelving run",
      widthShare: 0.14,
      depthShare: 0.45,
      fromHeightShare: 0,
      toHeightShare: 0.8,
      removable: true,
      reason: "Most UK garages keep a shelf run along one side wall.",
    },
    {
      kind: "utility_box",
      label: "Consumer unit",
      widthShare: 0.12,
      depthShare: 0.08,
      fromHeightShare: 0.55,
      toHeightShare: 0.8,
      removable: false,
      reason: "Electrical intake must stay clear for access.",
    },
  ],
  bedroom: [
    {
      kind: "equipment",
      label: "Radiator",
      widthShare: 0.35,
      depthShare: 0.06,
      fromHeightShare: 0.1,
      toHeightShare: 0.4,
      removable: false,
      reason: "Nothing should sit tight against a heat source.",
    },
  ],
  container: [],
  warehouse: [
    {
      kind: "pillar",
      label: "Structural pillar",
      widthShare: 0.08,
      depthShare: 0.08,
      fromHeightShare: 0,
      toHeightShare: 1,
      removable: false,
      reason: "Bay structures carry the roof load on internal pillars.",
    },
  ],
  loft: [
    {
      kind: "beam",
      label: "Roof truss",
      widthShare: 1,
      depthShare: 0.1,
      fromHeightShare: 0.55,
      toHeightShare: 1,
      removable: false,
      reason: "Trusses cross the span and limit what can stand upright.",
    },
    {
      kind: "low_ceiling",
      label: "Eaves",
      widthShare: 0.18,
      depthShare: 1,
      fromHeightShare: 0.35,
      toHeightShare: 1,
      removable: false,
      reason: "Headroom falls away sharply at the eaves.",
    },
  ],
  shed: [
    {
      kind: "tools",
      label: "Garden tools",
      widthShare: 0.16,
      depthShare: 0.2,
      fromHeightShare: 0,
      toHeightShare: 0.9,
      removable: true,
      reason: "Hosts usually keep tools in the corner nearest the door.",
    },
  ],
  commercial: [
    {
      kind: "equipment",
      label: "Roller shutter housing",
      widthShare: 1,
      depthShare: 0.05,
      fromHeightShare: 0.85,
      toHeightShare: 1,
      removable: false,
      reason: "The shutter drum reduces clearance at the opening.",
    },
  ],
  storage_room: [
    {
      kind: "water_pipe",
      label: "Pipework run",
      widthShare: 0.05,
      depthShare: 1,
      fromHeightShare: 0.8,
      toHeightShare: 1,
      removable: false,
      reason: "Internal rooms often carry a service run at high level.",
    },
  ],
  parking: [
    {
      kind: "step",
      label: "Kerb",
      widthShare: 1,
      depthShare: 0.04,
      fromHeightShare: 0,
      toHeightShare: 0.06,
      removable: false,
      reason: "A kerb edge affects trolley access from the road.",
    },
  ],
};

/**
 * Proposes the obstacles typical of a space type. Host-confirmed obstacles
 * always win: pass them in and nothing is invented alongside them.
 */
export function proposeObstacles(space: StorageSpace, confirmed?: Obstacle[]): Obstacle[] {
  if (confirmed && confirmed.length > 0) return confirmed;

  const templates = TEMPLATES[space.kind] ?? [];
  const seed = spaceSeed(space, "obstacles");

  return templates.map((template, index) => {
    const w = round2(space.width * template.widthShare);
    const d = round2(space.depth * template.depthShare);
    const alongRight = (seed >> index) % 2 === 1;
    return {
      id: `${space.id}-obstacle-${index}`,
      kind: template.kind,
      label: template.label,
      footprint: {
        x: alongRight ? round2(Math.max(0, space.width - w)) : 0,
        y: round2(Math.min(space.depth - d, (index * space.depth) / 4)),
        w,
        d,
      },
      fromHeightM: round2(space.height * template.fromHeightShare),
      toHeightM: round2(space.height * template.toHeightShare),
      removable: template.removable,
      confidence: template.removable ? 0.62 : 0.74,
      reason: template.reason,
    };
  });
}

/** Floor area an obstacle actually removes, in m². Overhead ones remove none. */
export function obstacleFloorArea(obstacle: Obstacle): number {
  if (obstacle.fromHeightM > 1.2) return 0;
  return round2(obstacle.footprint.w * obstacle.footprint.d);
}

/** Proposes the shelving a space plausibly has, unless the host declared it. */
export function proposeShelves(
  space: StorageSpace,
  obstacles: Obstacle[],
  declared?: Shelf[],
): Shelf[] {
  if (declared && declared.length > 0) return declared;

  const runs = obstacles.filter((obstacle) => obstacle.kind === "shelving");
  return runs.map((run, index) => {
    const lengthM = round2(Math.max(run.footprint.d, run.footprint.w));
    const depthM = 0.4;
    const levels = Math.max(2, Math.min(5, Math.floor(space.height / 0.45)));
    return {
      id: `${space.id}-shelf-${index}`,
      side: run.footprint.x > space.width / 2 ? "right" : "left",
      lengthM,
      depthM,
      levels,
      loadPerLevelKg: 40,
      capacityM3: round2(lengthM * depthM * 0.4 * levels),
    };
  });
}
