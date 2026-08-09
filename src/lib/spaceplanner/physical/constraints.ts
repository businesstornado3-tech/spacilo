/**
 * Phase 6E — hard constraint validation.
 *
 * A plan that violates any of these is INVALID, whatever it scores and however
 * good the picture looks. The engine would rather report "not everything fits
 * while keeping access" than fabricate a successful arrangement.
 */
import { accessGeometry, contains, doorwayZone, intersects } from "./space";
import type {
  ArrangementEntry,
  PlanningItem,
  PlanningSpace,
  Violation,
} from "./types";
import { ACCESS_DEFAULTS } from "./space";

export interface ValidationInput {
  space: PlanningSpace;
  items: PlanningItem[];
  entries: ArrangementEntry[];
  unplacedUnits: Map<string, number>;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

const cm = (metres: number) => Math.round(metres * 100);

/**
 * Every footprint dimension must be one of the object's canonical dimensions.
 * The planner may turn an object; it may never shrink one to make it fit.
 */
export function matchesCanonicalFootprint(item: PlanningItem, w: number, d: number): boolean {
  const dims = [item.widthCm, item.depthCm, item.heightCm].map((value) => Math.round(value));
  const near = (value: number) => dims.some((dim) => Math.abs(dim - value) <= 2);
  return near(cm(w)) && near(cm(d));
}

export function validateArrangement(input: ValidationInput): ValidationResult {
  const { space, items, entries } = input;
  const violations: Violation[] = [];
  const geometry = accessGeometry(space);
  const door = doorwayZone(space);
  const ceiling = Math.min(space.heightM, ACCESS_DEFAULTS.maxStackHeightM);

  // A. every confirmed item is accounted for, placed or explicitly unplaced.
  for (const item of items) {
    const placed = entries
      .filter((entry) => entry.itemId === item.id)
      .reduce((sum, entry) => sum + entry.units, 0);
    const unplaced = input.unplacedUnits.get(item.id) ?? 0;
    if (placed + unplaced !== item.quantity) {
      violations.push({
        code: "missing_item",
        itemId: item.id,
        message: `${item.label}: ${placed + unplaced} of ${item.quantity} accounted for.`,
      });
    }
  }

  // B. nothing may appear that the user never confirmed.
  const known = new Set(items.map((item) => item.id));
  for (const entry of entries) {
    if (!known.has(entry.itemId)) {
      violations.push({
        code: "invented_item",
        itemId: entry.itemId,
        message: `${entry.label} is not in the confirmed inventory.`,
      });
    }
  }

  const itemById = new Map(items.map((item) => [item.id, item]));

  for (const entry of entries) {
    const item = itemById.get(entry.itemId);

    // C0. coordinates must exist and be real numbers.
    const numbers = [entry.x, entry.y, entry.w, entry.d, entry.heightM, entry.baseHeightM];
    if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      violations.push({
        code: "missing_coordinates",
        itemId: entry.itemId,
        message: `${entry.label} has no valid position.`,
      });
      continue;
    }
    if (entry.w <= 0 || entry.d <= 0 || entry.heightM <= 0) {
      violations.push({
        code: "missing_coordinates",
        itemId: entry.itemId,
        message: `${entry.label} has a zero or negative dimension.`,
      });
    }

    // C1. only physically valid rotations.
    if (entry.rotationDeg !== 0 && entry.rotationDeg !== 90) {
      violations.push({
        code: "invalid_rotation",
        itemId: entry.itemId,
        message: `${entry.label} uses a rotation the planner does not support.`,
      });
    }

    // C2. dimensions must match the canonical record exactly.
    if (item && !matchesCanonicalFootprint(item, entry.w, entry.d)) {
      violations.push({
        code: "invalid_dimensions",
        itemId: entry.itemId,
        message: `${entry.label} was drawn at a size its measurements do not allow.`,
      });
    }

    // C3. wall-mounted objects are never floor-standing, and nothing else hangs.
    if (item?.wallMounted && (!entry.mounted || entry.layer === 0)) {
      violations.push({
        code: "invalid_wall_mount",
        itemId: entry.itemId,
        message: `${entry.label} is wall-mounted and must not stand on the floor.`,
      });
    }
    if (entry.mounted && (!item?.wallMounted || entry.baseHeightM <= 0)) {
      violations.push({
        code: "invalid_wall_mount",
        itemId: entry.itemId,
        message: `${entry.label} is shown on a wall but is not a wall-mounted object.`,
      });
    }

    // C. inside the user-approved usable area. A wall-mounted object hangs on
    // a wall of the ROOM and consumes no storage floor, so it is bounded by the
    // room, not by the storage footprint the user marked.
    const bounds = entry.mounted
      ? { x: 0, y: 0, w: space.widthM, d: space.depthM }
      : space.usable;
    if (!contains(bounds, entry)) {
      violations.push({
        code: "outside_usable_area",
        itemId: entry.itemId,
        message: `${entry.label} sits outside the area selected for storage.`,
      });
    }

    // E/F. access geometry stays clear.
    if (entry.layer === 0 && intersects(entry, door)) {
      violations.push({
        code: "doorway_blocked",
        itemId: entry.itemId,
        message: `${entry.label} blocks the opening.`,
      });
    }
    if (entry.layer === 0 && geometry.walkway && intersects(entry, geometry.walkway)) {
      violations.push({
        code: "walkway_blocked",
        itemId: entry.itemId,
        message: `${entry.label} blocks the access route.`,
      });
    }

    // G. fixed furniture and exclusions.
    for (const obstacle of space.obstacles) {
      if (entry.layer === 0 && intersects(entry, obstacle)) {
        violations.push({
          code: "obstacle_blocked",
          itemId: entry.itemId,
          message: `${entry.label} overlaps ${obstacle.label}.`,
        });
      }
    }

    // H/I. dimensions and orientation.
    if (entry.baseHeightM + entry.heightM > ceiling + 0.001) {
      violations.push({
        code: "exceeds_height",
        itemId: entry.itemId,
        message: `${entry.label} would stand higher than the safe stacking height.`,
      });
    }
    if (
      !entry.mounted &&
      (entry.w > space.usable.w + 0.001 || entry.d > space.usable.d + 0.001)
    ) {
      violations.push({
        code: "unsupported_orientation",
        itemId: entry.itemId,
        message: `${entry.label} cannot be turned to fit the usable area.`,
      });
    }
    if (entry.layer > 0 && !entry.supportedBy) {
      violations.push({
        code: "unrealistic_stack",
        itemId: entry.itemId,
        message: `${entry.label} is stacked with nothing underneath it.`,
      });
    }
  }

  // D. no two floor footprints may occupy the same place.
  const floor = entries.filter((entry) => entry.layer === 0);
  for (let i = 0; i < floor.length; i += 1) {
    for (let j = i + 1; j < floor.length; j += 1) {
      const a = floor[i]!;
      const b = floor[j]!;
      if (intersects(a, b)) {
        violations.push({
          code: "collision",
          itemId: a.itemId,
          message: `${a.label} and ${b.label} overlap.`,
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/** True only when a real, unobstructed corridor survives the arrangement. */
export function walkwayIsClear(space: PlanningSpace, entries: ArrangementEntry[]): boolean {
  const geometry = accessGeometry(space);
  const door = doorwayZone(space);
  const floor = entries.filter((entry) => entry.layer === 0);
  const doorClear = floor.every((entry) => !intersects(entry, door));
  if (!geometry.walkway) return doorClear;
  return doorClear && floor.every((entry) => !intersects(entry, geometry.walkway!));
}
