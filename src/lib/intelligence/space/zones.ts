/**
 * Milestone 3 — space zoning.
 *
 * Divides a space into purposeful zones: heavy at the back on the floor,
 * boxes on shelving, bikes on mountable wall, fragile high and dry, seasonal
 * out of reach, overflow last. Zones are proposals with capacity,
 * restrictions, confidence and advice — a host can overrule any of them.
 */
import type {
  Obstacle,
  PlanRect,
  RoomGeometry,
  Shelf,
  StorageSpace,
  StorageZone,
  Walkway,
  ZoneKind,
} from "./contracts";
import { clamp01, round2 } from "./geometry";

interface ZoneRule {
  kind: ZoneKind;
  label: string;
  maxWeight: StorageZone["maxWeight"];
  restrictions: string[];
  recommendations: string[];
  reason: string;
}

const RULES: Record<ZoneKind, ZoneRule> = {
  heavy: {
    kind: "heavy",
    label: "Heavy items",
    maxWeight: "heavy",
    restrictions: ["Floor level only", "Nothing stacked more than two high"],
    recommendations: ["Keep heavy items on the floor against the back wall"],
    reason: "Weight belongs low and deep so nothing has to be lifted past it.",
  },
  large_furniture: {
    kind: "large_furniture",
    label: "Large furniture",
    maxWeight: "heavy",
    restrictions: ["Protect upholstery from the floor", "Do not stack on soft tops"],
    recommendations: ["Stand wardrobes and mattresses on edge along a long wall"],
    reason: "Long items store flattest against the deepest run of wall.",
  },
  boxes: {
    kind: "boxes",
    label: "Boxes",
    maxWeight: "medium",
    restrictions: ["Heaviest boxes on the bottom"],
    recommendations: ["Stack boxes in even columns so labels stay visible"],
    reason: "Uniform boxes stack predictably and use height well.",
  },
  shelving: {
    kind: "shelving",
    label: "Shelving",
    maxWeight: "medium",
    restrictions: ["Respect the shelf load rating"],
    recommendations: ["Put small and frequently used items on shelves"],
    reason: "Shelving keeps the floor clear and items reachable.",
  },
  fragile: {
    kind: "fragile",
    label: "Fragile storage",
    maxWeight: "light",
    restrictions: ["Nothing stacked on top", "Away from doors and traffic"],
    recommendations: ["Keep fragile items at waist height where possible"],
    reason: "Fragile things need a spot nothing else is lifted over.",
  },
  bikes: {
    kind: "bikes",
    label: "Bikes",
    maxWeight: "medium",
    restrictions: ["Wall must be sound enough for a mount"],
    recommendations: ["Hang bikes vertically to recover floor space"],
    reason: "A mounted bike costs wall area instead of floor area.",
  },
  seasonal: {
    kind: "seasonal",
    label: "Seasonal storage",
    maxWeight: "light",
    restrictions: ["Light items only above head height"],
    recommendations: ["Store rarely used items highest and furthest back"],
    reason: "Things reached twice a year should not block anything else.",
  },
  vehicle: {
    kind: "vehicle",
    label: "Vehicle area",
    maxWeight: "heavy",
    restrictions: ["Keep clear of the opening", "No fuel or batteries left connected"],
    recommendations: ["Reserve the central bay for wheeled items"],
    reason: "Wheeled items need a straight run to the opening.",
  },
  overflow: {
    kind: "overflow",
    label: "Overflow",
    maxWeight: "medium",
    restrictions: ["Only fill once the main zones are used"],
    recommendations: ["Keep overflow shallow so nothing is buried"],
    reason: "Spare capacity, held back so the plan can flex.",
  },
  loading: {
    kind: "loading",
    label: "Loading area",
    maxWeight: "light",
    restrictions: ["Must stay clear during handover"],
    recommendations: ["Keep the first metre inside the opening empty"],
    reason: "Loading needs somewhere to set things down.",
  },
  access: {
    kind: "access",
    label: "Access route",
    maxWeight: "light",
    restrictions: ["Nothing stored here at any time"],
    recommendations: ["Keep the route to the back wall walkable"],
    reason: "Anything unreachable is effectively lost.",
  },
};

function zone(
  space: StorageSpace,
  kind: ZoneKind,
  footprint: PlanRect,
  heightM: number,
  confidence: number,
): StorageZone {
  const rule = RULES[kind];
  const areaM2 = round2(Math.max(0, footprint.w) * Math.max(0, footprint.d));
  return {
    id: `${space.id}-zone-${kind}`,
    kind,
    label: rule.label,
    footprint: {
      x: round2(footprint.x),
      y: round2(footprint.y),
      w: round2(Math.max(0, footprint.w)),
      d: round2(Math.max(0, footprint.d)),
    },
    heightM: round2(heightM),
    areaM2,
    volumeM3: round2(areaM2 * heightM),
    maxWeight: rule.maxWeight,
    restrictions: rule.restrictions,
    recommendations: rule.recommendations,
    confidence: Math.round(clamp01(confidence) * 100) / 100,
    reason: rule.reason,
  };
}

/**
 * Builds the zone layout for a space. Depth is split back-to-front: heavy and
 * furniture deepest, boxes in the middle, fragile and loading nearest the
 * opening, with the access strip reserved from the walkway.
 */
export function buildZones(
  space: StorageSpace,
  geometry: RoomGeometry,
  obstacles: Obstacle[],
  shelves: Shelf[],
  walkways: Walkway[],
): StorageZone[] {
  const usableDepth = round2(
    Math.max(0, geometry.floor.depthM - walkways.reduce((sum, w) => sum + w.footprint.d, 0)),
  );
  const width = geometry.floor.widthM;
  const height = geometry.ceiling.minHeightM;
  const base = 0.72 + Math.min(0.16, obstacles.length === 0 ? 0.16 : 0.08);

  const zones: StorageZone[] = [];

  const backDepth = round2(usableDepth * 0.34);
  const midDepth = round2(usableDepth * 0.34);
  const frontDepth = round2(Math.max(0, usableDepth - backDepth - midDepth));

  zones.push(zone(space, "heavy", { x: 0, y: 0, w: round2(width * 0.5), d: backDepth }, Math.min(height, 1.2), base));
  zones.push(
    zone(
      space,
      "large_furniture",
      { x: round2(width * 0.5), y: 0, w: round2(width * 0.5), d: backDepth },
      height,
      base,
    ),
  );
  zones.push(zone(space, "boxes", { x: 0, y: backDepth, w: width, d: midDepth }, height, base + 0.04));

  if (frontDepth > 0.3) {
    zones.push(
      zone(space, "fragile", { x: 0, y: round2(backDepth + midDepth), w: round2(width * 0.4), d: frontDepth }, Math.min(height, 1.4), base),
    );
    zones.push(
      zone(
        space,
        "seasonal",
        { x: round2(width * 0.4), y: round2(backDepth + midDepth), w: round2(width * 0.6), d: frontDepth },
        height,
        base - 0.06,
      ),
    );
  }

  if (shelves.length > 0) {
    const shelf = shelves[0]!;
    zones.push(
      zone(space, "shelving", { x: 0, y: 0, w: shelf.depthM, d: shelf.lengthM }, height, 0.7),
    );
  }

  const mountableWall = geometry.walls.find((wall) => wall.mountable && wall.side !== "back");
  if (mountableWall && geometry.ceiling.minHeightM >= 1.9) {
    zones.push(
      zone(space, "bikes", { x: 0, y: round2(usableDepth * 0.4), w: 0.35, d: 1.8 }, 1.9, 0.68),
    );
  }

  if (space.kind === "parking" || space.kind === "garage" || space.kind === "commercial") {
    zones.push(
      zone(space, "vehicle", { x: round2(width * 0.15), y: 0, w: round2(width * 0.7), d: usableDepth }, geometry.ceiling.minHeightM, 0.66),
    );
  }

  for (const walkway of walkways) {
    zones.push(zone(space, "access", walkway.footprint, height, 0.9));
  }

  zones.push(
    zone(space, "overflow", { x: 0, y: 0, w: width, d: round2(usableDepth * 0.1) }, height, 0.6),
  );

  return zones;
}

/** Total storable volume across zones that actually hold things. */
export function zoneCapacityM3(zones: StorageZone[]): number {
  return round2(
    zones
      .filter((entry) => entry.kind !== "access" && entry.kind !== "loading")
      .reduce((sum, entry) => sum + entry.volumeM3, 0),
  );
}

export function findZone(zones: StorageZone[], kind: ZoneKind): StorageZone | null {
  return zones.find((entry) => entry.kind === kind) ?? null;
}
