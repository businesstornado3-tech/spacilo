/**
 * Phase 6E — space geometry: usable area, doorway, walkway and storage bands.
 *
 * Access is a first-class citizen. The corridor from the opening into the
 * storage area is explicit geometry, computed before a single item is placed,
 * and every band the packer is allowed to use is carved out around it.
 */
import type { StorageSpace } from "../types";
import { MAX_STACK_HEIGHT_M } from "../spaces";
import type { Obstacle, PlanningSpace, Rect } from "./types";

/** Access defaults. One place to tune clearance — never a literal in the packer. */
export const ACCESS_DEFAULTS = {
  /** Absolute minimum a person can pass through with a box. */
  minWalkwayM: 0.6,
  /** What the planner aims for when the space allows it. */
  preferredWalkwayM: 0.9,
  /** Clear depth kept immediately inside the opening. */
  doorwayClearanceM: 0.5,
  /** Nothing is ever stacked higher than this, whatever the ceiling. */
  maxStackHeightM: MAX_STACK_HEIGHT_M,
} as const;

const round2 = (value: number) => Math.round(value * 100) / 100;

export function rectArea(rect: Rect): number {
  return Math.max(0, rect.w) * Math.max(0, rect.d);
}

export function intersects(a: Rect, b: Rect, tolerance = 0.001): boolean {
  return (
    a.x + a.w > b.x + tolerance &&
    b.x + b.w > a.x + tolerance &&
    a.y + a.d > b.y + tolerance &&
    b.y + b.d > a.y + tolerance
  );
}

export function contains(outer: Rect, inner: Rect, tolerance = 0.01): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.d <= outer.y + outer.d + tolerance
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const d = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return w > 0 && d > 0 ? w * d : 0;
}

export interface UsableAreaInput {
  /** Normalised (0–1) bounding box of the user's usable-space selection. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A normalised photo selection → a floor rectangle.
 *
 * The bottom of a photograph is the near edge of the floor, so the selection's
 * vertical axis maps to depth with the front of the room at `y = depth`.
 */
export function usableRectFromSelection(
  space: { widthM: number; depthM: number },
  box: UsableAreaInput,
): Rect {
  const x = Math.max(0, Math.min(1, box.x)) * space.widthM;
  const w = Math.max(0.2, Math.min(1, box.width) * space.widthM);
  const y = Math.max(0, Math.min(1, box.y)) * space.depthM;
  const d = Math.max(0.2, Math.min(1, box.height) * space.depthM);
  return {
    x: round2(Math.min(x, space.widthM - 0.2)),
    y: round2(Math.min(y, space.depthM - 0.2)),
    w: round2(Math.min(w, space.widthM - x)),
    d: round2(Math.min(d, space.depthM - y)),
  };
}

export interface PlanningSpaceOptions {
  usable?: Rect;
  obstacles?: Obstacle[];
  walkwayClearanceM?: number;
  doorwayClearanceM?: number;
  heightKnown?: boolean;
  dimensionBasis?: PlanningSpace["dimensionBasis"];
  confidence?: number;
}

/** A marketplace `StorageSpace` → the planner's constrained space. */
export function planningSpaceFrom(
  space: StorageSpace,
  options: PlanningSpaceOptions = {},
): PlanningSpace {
  const usable = options.usable ?? { x: 0, y: 0, w: space.width, d: space.depth };
  const doorWidth = Math.min(space.doorWidth, space.width);
  const clearance = options.walkwayClearanceM ?? defaultClearance(space.width, space.depth);

  return {
    id: space.id,
    name: space.name,
    widthM: space.width,
    depthM: space.depth,
    heightM: space.height,
    heightKnown: options.heightKnown ?? true,
    usable: {
      x: Math.max(0, usable.x),
      y: Math.max(0, usable.y),
      w: Math.min(usable.w, space.width - Math.max(0, usable.x)),
      d: Math.min(usable.d, space.depth - Math.max(0, usable.y)),
    },
    doorway: { x: round2((space.width - doorWidth) / 2), w: round2(doorWidth) },
    walkwayClearanceM: clearance,
    doorwayClearanceM: options.doorwayClearanceM ?? ACCESS_DEFAULTS.doorwayClearanceM,
    obstacles: options.obstacles ?? [],
    dimensionBasis: options.dimensionBasis ?? "estimated",
    confidence: options.confidence ?? 0.7,
  };
}

/** Small rooms cannot give up a metre of floor; large ones should. */
export function defaultClearance(widthM: number, depthM: number): number {
  if (depthM < 1.6 || widthM < 1.4) return ACCESS_DEFAULTS.minWalkwayM;
  const generous = widthM >= 2.4 && depthM >= 3;
  return generous ? ACCESS_DEFAULTS.preferredWalkwayM : ACCESS_DEFAULTS.minWalkwayM;
}

/** The clear rectangle kept immediately inside the opening. */
export function doorwayZone(space: PlanningSpace): Rect {
  const depth = Math.min(space.doorwayClearanceM, space.depthM);
  return {
    x: space.doorway.x,
    y: round2(space.depthM - depth),
    w: space.doorway.w,
    d: round2(depth),
  };
}

export interface AccessGeometry {
  /** The access corridor, or null when the space is too small to hold one. */
  walkway: Rect | null;
  /** Storage bands, in the order the packer should fill them. */
  bands: { id: string; rect: Rect; zone: "back-wall" | "left-wall" | "right-wall" | "interior" }[];
  /** Everything that must stay clear: doorway, corridor, obstacles. */
  keepClear: Rect[];
}

/**
 * Carve the usable floor into an access corridor plus wall-hugging storage
 * bands. Storage happens against walls and in corners; the middle of the room
 * is the corridor, which is exactly why the result cannot look scattered.
 */
export function accessGeometry(space: PlanningSpace): AccessGeometry {
  const usable = space.usable;
  const door = doorwayZone(space);
  const keepClear: Rect[] = [door, ...space.obstacles];

  if (usable.w <= 0 || usable.d <= 0) {
    return { walkway: null, bands: [], keepClear };
  }

  // A back band across the full width is the best home for large, heavy items.
  const backBand = usable.d >= 1.6 ? Math.min(1.2, round2(usable.d * 0.4)) : 0;
  const corridorDepth = round2(usable.d - backBand);

  const maxCorridor = Math.max(0, usable.w - 0.4);
  const corridorWidth = round2(Math.min(space.walkwayClearanceM, maxCorridor));

  const bands: AccessGeometry["bands"] = [];

  if (backBand >= 0.3) {
    bands.push({
      id: "back",
      rect: { x: usable.x, y: usable.y, w: usable.w, d: backBand },
      zone: "back-wall",
    });
  }

  if (corridorWidth < ACCESS_DEFAULTS.minWalkwayM || corridorDepth < 0.3) {
    // Too small for a real corridor: the doorway clearance is the access, and
    // the rest of the usable floor is one band.
    const rest = {
      x: usable.x,
      y: usable.y + backBand,
      w: usable.w,
      d: Math.max(0, corridorDepth),
    };
    if (rest.d >= 0.2) bands.push({ id: "front", rect: rest, zone: "interior" });
    return { walkway: null, bands, keepClear };
  }

  const doorCentre = space.doorway.x + space.doorway.w / 2;
  const rightMost = round2(usable.x + usable.w - corridorWidth);
  const side = space.corridorSide ?? "centre";
  // A corridor down one side keeps the storage as a single contiguous block;
  // a central corridor necessarily splits it into two.
  const corridorX =
    side === "left"
      ? round2(usable.x)
      : side === "right"
        ? rightMost
        : round2(Math.max(usable.x, Math.min(doorCentre - corridorWidth / 2, rightMost)));

  const walkway: Rect = {
    x: corridorX,
    y: round2(usable.y + backBand),
    w: corridorWidth,
    d: corridorDepth,
  };
  keepClear.push(walkway);

  const left: Rect = { x: usable.x, y: walkway.y, w: round2(walkway.x - usable.x), d: walkway.d };
  const rightX = round2(walkway.x + walkway.w);
  const right: Rect = {
    x: rightX,
    y: walkway.y,
    w: round2(usable.x + usable.w - rightX),
    d: walkway.d,
  };

  const sides = [
    { id: "left", rect: left, zone: "left-wall" as const },
    { id: "right", rect: right, zone: "right-wall" as const },
  ]
    .filter((band) => band.rect.w >= 0.2)
    // The wider side first: bigger items get the better wall.
    .sort((a, b) => b.rect.w - a.rect.w);

  bands.push(...sides);
  return { walkway, bands, keepClear };
}

/** Storage volume actually available: usable floor minus access, times stack height. */
export function usableStorageVolume(space: PlanningSpace): number {
  const geometry = accessGeometry(space);
  const bandArea = geometry.bands.reduce((sum, band) => sum + rectArea(band.rect), 0);
  const obstacleArea = space.obstacles.reduce(
    (sum, obstacle) =>
      sum + geometry.bands.reduce((inner, band) => inner + overlapArea(band.rect, obstacle), 0),
    0,
  );
  const height = Math.min(space.heightM, ACCESS_DEFAULTS.maxStackHeightM);
  return Math.max(0, round2((bandArea - obstacleArea) * height));
}
