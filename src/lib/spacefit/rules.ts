/**
 * Hard compatibility checks. A hard failure can never be offset by a high
 * score elsewhere — the space is simply not suitable.
 */
import type { ItemCategory } from "@/lib/inventory-model";
import { CATEGORY_ACCEPTANCE_MAP, RESTRICTION_RULES } from "./config";
import { categoryLabel } from "@/lib/spaces";
import type { CheckState, HardFailure, MatchInventory, MatchSpace } from "./types";

/** Longest edge per renter category, used by restriction and entrance rules. */
export function longestEdgeByCategory(inventory: MatchInventory): Partial<Record<ItemCategory, number>> {
  const map: Partial<Record<ItemCategory, number>> = {};
  for (const item of inventory.items) {
    const dims = [item.length_cm, item.width_cm, item.height_cm].map((v) => Number(v ?? 0));
    if (dims.some((d) => !d)) continue;
    const longest = Math.max(...dims);
    if (longest > (map[item.category] ?? 0)) map[item.category] = longest;
  }
  return map;
}

export interface CategoryCoverage {
  accepted: ItemCategory[];
  unspecified: ItemCategory[];
  rejected: ItemCategory[];
}

/** Compares confirmed renter categories against the host's accepted list. */
export function categoryCoverage(space: MatchSpace, inventory: MatchInventory): CategoryCoverage {
  const declared = (space.accepted_categories ?? []).filter(Boolean);
  const coverage: CategoryCoverage = { accepted: [], unspecified: [], rejected: [] };

  for (const category of inventory.categories) {
    const tokens = CATEGORY_ACCEPTANCE_MAP[category] ?? [];
    if (declared.length === 0) {
      coverage.unspecified.push(category);
      continue;
    }
    if (tokens.some((token) => declared.includes(token))) coverage.accepted.push(category);
    else coverage.rejected.push(category);
  }
  return coverage;
}

/** Human label for a renter category, using the host-facing vocabulary. */
export function renterCategoryLabel(category: ItemCategory): string {
  const token = CATEGORY_ACCEPTANCE_MAP[category]?.[0];
  return token ? categoryLabel(token).toLowerCase() : category;
}

export interface EntranceCheck {
  state: CheckState;
  /** Item that cannot pass through, when state is "fail". */
  blockingItemName?: string;
  doorWidthCm?: number;
  doorHeightCm?: number;
}

/**
 * Entrance fit. An item passes if its two smallest dimensions fit through the
 * opening in either orientation. Dimensions are never inferred from photos.
 */
export function entranceCheck(space: MatchSpace, inventory: MatchInventory): EntranceCheck {
  const width = space.door_width_cm ?? null;
  const height = space.door_height_cm ?? null;
  if (!width || !height) return { state: "unknown" };

  for (const item of inventory.items) {
    const dims = [item.length_cm, item.width_cm, item.height_cm]
      .map((v) => Number(v ?? 0))
      .sort((a, b) => a - b);
    if (dims.some((d) => !d)) continue;
    const [a, b] = dims as [number, number, number];
    const fits = (a <= width && b <= height) || (a <= height && b <= width);
    if (!fits) {
      return {
        state: "fail",
        blockingItemName: item.item_name,
        doorWidthCm: width,
        doorHeightCm: height,
      };
    }
  }
  return { state: "pass", doorWidthCm: width, doorHeightCm: height };
}

export interface HardCheckOutcome {
  failures: HardFailure[];
  capacityRatio: number | null;
  coverage: CategoryCoverage;
  entrance: EntranceCheck;
}

/** Runs every hard check. Only spaces with zero failures may be scored. */
export function runHardChecks(space: MatchSpace, inventory: MatchInventory): HardCheckOutcome {
  const failures: HardFailure[] = [];

  // B — capacity. Missing capacity data is UNKNOWN, handled in scoring.
  const available = space.estimated_available_volume_m3 === null ? null : Number(space.estimated_available_volume_m3);
  const required = inventory.storageRequirementM3;
  const capacityRatio = available !== null && required > 0 ? available / required : null;

  if (available !== null && required > 0 && available < required) {
    failures.push({
      rule: "capacity",
      message: "Not enough estimated available space for your inventory.",
    });
  }

  // C — accepted item categories.
  const coverage = categoryCoverage(space, inventory);
  for (const category of coverage.rejected) {
    failures.push({
      rule: "accepted_categories",
      message: `This host doesn't currently accept ${renterCategoryLabel(category)}.`,
    });
  }

  // D — explicit host restrictions.
  const longest = longestEdgeByCategory(inventory);
  const restrictions = space.host_restrictions ?? [];
  for (const rule of RESTRICTION_RULES) {
    if (restrictions.includes(rule.restriction) && rule.applies(inventory.categories, longest)) {
      failures.push({ rule: "host_restriction", message: rule.message });
    }
  }

  // E — entrance fit, only when the host has supplied dimensions.
  const entrance = entranceCheck(space, inventory);
  if (entrance.state === "fail") {
    failures.push({
      rule: "entrance",
      message: `Your ${entrance.blockingItemName ?? "largest item"} won't fit through the entrance the host has described.`,
    });
  }

  return { failures, capacityRatio, coverage, entrance };
}
