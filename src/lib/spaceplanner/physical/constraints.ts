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

  for (const entry of entries) {
    // C. inside the user-approved usable area.
    if (!contains(space.usable, entry)) {
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
    if (entry.w > space.usable.w + 0.001 || entry.d > space.usable.d + 0.001) {
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
