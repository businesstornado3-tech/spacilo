/**
 * SpaceFit Pack — deterministic packing plan (`spacefit-pack-v1`).
 *
 * Produces a suggested arrangement for a renter's belongings inside a specific
 * host space: which zone each group of items belongs in, the order to load
 * them, safety guidance and access notes.
 *
 * Deterministic and pure. No AI, no randomness, no network. The same inventory
 * and the same space geometry always produce the same plan, which is what
 * allows the plan to be frozen into a request/booking snapshot and remain
 * meaningful months later.
 *
 * The plan is ADVISORY. It is never presented as a guarantee that everything
 * will physically fit, and it never replaces the host's own house rules.
 */
import { CATEGORY_LABELS, type InventoryItem, type ItemCategory } from "@/lib/inventory-model";
import type { RequiredSpace } from "./requirement";

export const SPACEFIT_PACK_VERSION = "spacefit-pack-v1";

export type ZoneKey = "back" | "base" | "upper" | "front";

/** Geometry the plan reasons about. Public-safe listing fields only. */
export interface PackSpace {
  usableVolumeM3: number | null;
  floorAreaM2: number | null;
  heightM: number | null;
  doorWidthCm: number | null;
  doorHeightCm: number | null;
  moistureCondition: string | null;
  temperatureCondition: string | null;
  accessType: string | null;
  obstacles: { key?: string | null; label?: string | null; volume_m3?: number | null }[];
}

export interface PackZoneItem {
  label: string;
  quantity: number;
  category: ItemCategory;
  fragile: boolean;
}

export interface PackZone {
  key: ZoneKey;
  title: string;
  description: string;
  items: PackZoneItem[];
}

export interface PackPlan {
  algorithm: typeof SPACEFIT_PACK_VERSION;
  zones: PackZone[];
  /** Step-by-step loading order, back of the space first. */
  loadingOrder: string[];
  safety: string[];
  accessNotes: string[];
  /** Share of the space's usable volume the belongings are estimated to take. */
  utilisationPercent: number | null;
  floorAreaCheck: "pass" | "tight" | "fail" | "unknown";
  headroomCheck: "pass" | "fail" | "unknown";
  doorwayCheck: "pass" | "fail" | "unknown";
  /** Full text equivalent, so the plan is never diagram-only. */
  textSummary: string;
}

const ZONE_META: Record<ZoneKey, { title: string; description: string }> = {
  back: {
    title: "Back wall — long stay",
    description: "Big, heavy things you won't need until the very end.",
  },
  base: {
    title: "Base layer",
    description: "Sturdy boxes and crates that can safely take weight on top.",
  },
  upper: {
    title: "Upper stack",
    description: "Lighter items stacked on the base layer.",
  },
  front: {
    title: "Front — easy reach",
    description: "Fragile things and anything you might need part-way through.",
  },
};

const ZONE_ORDER: ZoneKey[] = ["back", "base", "upper", "front"];

/** Which zone a category belongs in when nothing overrides it. */
const CATEGORY_ZONE: Record<ItemCategory, ZoneKey> = {
  furniture: "back",
  appliances: "back",
  boxes: "base",
  business: "base",
  documents: "base",
  bags: "upper",
  student: "upper",
  other: "upper",
  electronics: "front",
  bicycles: "front",
  sports: "front",
};

function zoneFor(item: InventoryItem): ZoneKey {
  // Fragile always goes to the front, never underneath anything.
  if (item.fragile) return "front";
  if (item.stackable === "no" && CATEGORY_ZONE[item.category] === "base") return "back";
  return CATEGORY_ZONE[item.category] ?? "upper";
}

export function buildPackPlan(
  items: InventoryItem[],
  requirement: RequiredSpace,
  space: PackSpace,
): PackPlan {
  /* ------------------------------------------------------------- zones */
  const grouped = new Map<ZoneKey, PackZoneItem[]>();
  for (const item of items) {
    const key = zoneFor(item);
    const list = grouped.get(key) ?? [];
    list.push({
      label: item.item_name,
      quantity: item.quantity,
      category: item.category,
      fragile: item.fragile,
    });
    grouped.set(key, list);
  }

  const zones: PackZone[] = ZONE_ORDER.filter((key) => (grouped.get(key)?.length ?? 0) > 0).map(
    (key) => ({
      key,
      title: ZONE_META[key].title,
      description: ZONE_META[key].description,
      items: [...(grouped.get(key) ?? [])].sort(
        (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label),
      ),
    }),
  );

  /* ------------------------------------------------------------ checks */
  const utilisationPercent =
    space.usableVolumeM3 && space.usableVolumeM3 > 0
      ? Math.round((requirement.requiredVolumeM3 / space.usableVolumeM3) * 100)
      : null;

  const floorAreaCheck: PackPlan["floorAreaCheck"] = !space.floorAreaM2
    ? "unknown"
    : requirement.requiredFloorAreaM2 <= space.floorAreaM2 * 0.85
      ? "pass"
      : requirement.requiredFloorAreaM2 <= space.floorAreaM2
        ? "tight"
        : "fail";

  const headroomCheck: PackPlan["headroomCheck"] =
    space.heightM === null || requirement.requiredHeightM === null
      ? "unknown"
      : requirement.requiredHeightM <= space.heightM
        ? "pass"
        : "fail";

  const doorwayCheck: PackPlan["doorwayCheck"] = (() => {
    const clearance = requirement.requiredDoorClearanceCm;
    if (clearance === null) return "unknown";
    if (space.doorWidthCm === null && space.doorHeightCm === null) return "unknown";
    const widest = Math.max(space.doorWidthCm ?? 0, space.doorHeightCm ?? 0);
    return clearance <= widest ? "pass" : "fail";
  })();

  /* ------------------------------------------------------ loading order */
  const loadingOrder: string[] = [];
  for (const zone of zones) {
    loadingOrder.push(`${zone.title}: ${zone.description}`);
  }
  if (loadingOrder.length > 0) {
    loadingOrder.push("Leave a clear walkway from the door to the back of the space.");
  }

  /* ------------------------------------------------------------ safety */
  const safety: string[] = ["Never block the doorway, a fire exit or an electricity meter."];
  if (requirement.fragileCount > 0) {
    safety.push("Keep fragile items on top or at the front — don't put weight on them.");
  }
  if (requirement.nonStackableCount > 0) {
    safety.push("Items marked as not stackable need their own floor space.");
  }
  if (space.moistureCondition && space.moistureCondition !== "dry") {
    safety.push("This space isn't confirmed as fully dry — raise boxes off the floor and avoid storing anything moisture-sensitive.");
  }
  if (space.temperatureCondition === "unheated") {
    safety.push("The space is unheated, so avoid electronics, candles, paint and anything sensitive to cold.");
  }
  for (const obstacle of space.obstacles.slice(0, 6)) {
    const label = obstacle?.label?.trim();
    if (label) safety.push(`Keep clear of the ${label.toLowerCase()} the host has flagged.`);
  }

  /* ------------------------------------------------------------ access */
  const accessNotes: string[] = [];
  if (space.accessType === "host_present" || space.accessType === "by_arrangement") {
    accessNotes.push("Access is arranged with the host, so pack anything you may need sooner near the front.");
  }
  if (space.accessType === "anytime" || space.accessType === "independent") {
    accessNotes.push("You can get in independently, so a single access aisle is usually enough.");
  }
  if (doorwayCheck === "fail" && requirement.largestItemLabel) {
    accessNotes.push(`Your ${requirement.largestItemLabel.toLowerCase()} may not fit through the entrance — check with the host first.`);
  }
  if (doorwayCheck === "unknown") {
    accessNotes.push("The host hasn't given entrance measurements, so confirm large items with them.");
  }

  return {
    algorithm: SPACEFIT_PACK_VERSION,
    zones,
    loadingOrder,
    safety,
    accessNotes,
    utilisationPercent,
    floorAreaCheck,
    headroomCheck,
    doorwayCheck,
    textSummary: buildTextSummary(zones, utilisationPercent, floorAreaCheck),
  };
}

function buildTextSummary(
  zones: PackZone[],
  utilisationPercent: number | null,
  floorAreaCheck: PackPlan["floorAreaCheck"],
): string {
  if (zones.length === 0) return "There's nothing in your inventory to plan yet.";

  const parts = zones.map((zone) => {
    const list = zone.items
      .map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.label}` : item.label))
      .join(", ");
    return `${zone.title}: ${list}.`;
  });

  if (utilisationPercent !== null) {
    parts.push(`Your belongings are estimated to use about ${utilisationPercent}% of the usable volume.`);
  }
  if (floorAreaCheck === "tight") {
    parts.push("Floor space looks tight, so plan to stack carefully.");
  }
  if (floorAreaCheck === "fail") {
    parts.push("Your belongings may need more floor space than this space offers.");
  }
  return parts.join(" ");
}

export const PACK_PLAN_DISCLAIMER =
  "SpaceFit Pack is a suggested arrangement based on estimated sizes. It's guidance, not a guarantee that everything will fit, and the host's own rules always come first.";

export const CATEGORY_ZONE_LABELS = Object.fromEntries(
  (Object.keys(CATEGORY_ZONE) as ItemCategory[]).map((key) => [
    key,
    `${CATEGORY_LABELS[key]} → ${ZONE_META[CATEGORY_ZONE[key]].title}`,
  ]),
) as Record<ItemCategory, string>;
