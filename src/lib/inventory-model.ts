/**
 * Renter inventory domain model.
 *
 * Two distinct concepts, kept deliberately separate:
 *
 *  1. ITEM VOLUME — the nominal cuboid volume of the belongings
 *     (length x width x height x quantity). Pure geometry.
 *
 *  2. ESTIMATED STORAGE REQUIREMENT — a practical allowance on top of item
 *     volume representing packing and spacing inefficiency: gangways, awkward
 *     shapes, items that cannot be stacked, and room to actually reach things.
 *
 * The allowance model below is a simple, deterministic MVP. It is NOT SpaceFit
 * AI and must never be presented as such. The multipliers mirror the database
 * rollup in `public.inventory_recalculate` — change both together.
 *
 * ASSUMPTIONS
 *  - Highly stackable, regular-shaped goods (boxes, documents, business stock)
 *    pack efficiently: +15%.
 *  - Mixed household goods (bags, electronics, student belongings) are semi
 *    regular and partly stackable: +25%.
 *  - Large, irregular or non-stackable goods (furniture, appliances, bicycles,
 *    sports kit, uncategorised items) waste the most space: +40%.
 *  - Items with unknown dimensions contribute 0 m3 and are surfaced to the user
 *    rather than silently guessed.
 *
 * Prompt 6 may replace this module wholesale; no UI component should reimplement
 * any of this logic inline.
 */
import type { Enums, Tables } from "@/integrations/supabase/types";

export type InventoryItem = Tables<"inventory_items">;
export type Inventory = Tables<"renter_inventories">;
export type InventoryPhoto = Tables<"inventory_photos">;
export type ItemCategory = Enums<"inventory_item_category">;
export type ItemTriState = Enums<"item_tri_state">;
export type SizeSource = Enums<"item_size_source">;

/** Packing allowance per category. Mirrors inventory_recalculate() in SQL. */
export const PACKING_ALLOWANCE: Record<ItemCategory, number> = {
  boxes: 1.15,
  documents: 1.15,
  business: 1.15,
  bags: 1.25,
  electronics: 1.25,
  student: 1.25,
  furniture: 1.4,
  appliances: 1.4,
  bicycles: 1.4,
  sports: 1.4,
  other: 1.4,
};

export const ALLOWANCE_EXPLAINER =
  "Real-world storage needs depend on item shape, stacking, access and arrangement.";

/* ------------------------------------------------------------------ volumes */

/** Nominal volume of a single item in m3, from centimetre dimensions. */
export function unitVolumeM3(
  lengthCm?: number | null,
  widthCm?: number | null,
  heightCm?: number | null,
): number | null {
  if (!lengthCm || !widthCm || !heightCm) return null;
  return (lengthCm * widthCm * heightCm) / 1_000_000;
}

/** Nominal volume of an item line (unit volume x quantity). */
export function itemVolumeM3(item: Pick<InventoryItem, "length_cm" | "width_cm" | "height_cm" | "quantity">) {
  const unit = unitVolumeM3(num(item.length_cm), num(item.width_cm), num(item.height_cm));
  return unit === null ? null : unit * item.quantity;
}

export interface InventoryTotals {
  /** Number of physical things (sum of quantities). */
  itemCount: number;
  /** Number of distinct item lines. */
  lineCount: number;
  /** Raw geometric volume, m3. */
  itemVolumeM3: number;
  /** Item volume plus the packing allowance, m3. */
  storageRequirementM3: number;
  /** Lines with no usable dimensions. */
  unknownSizeLines: number;
}

/** Client-side mirror of the database rollup, used for optimistic UI. */
export function calculateTotals(items: InventoryItem[]): InventoryTotals {
  let itemVolume = 0;
  let requirement = 0;
  let itemCount = 0;
  let unknown = 0;

  for (const item of items) {
    itemCount += item.quantity;
    const volume = itemVolumeM3(item);
    if (volume === null) {
      unknown += 1;
      continue;
    }
    itemVolume += volume;
    requirement += volume * (PACKING_ALLOWANCE[item.category] ?? 1.4);
  }

  return {
    itemCount,
    lineCount: items.length,
    itemVolumeM3: round(itemVolume, 3),
    storageRequirementM3: round(requirement, 3),
    unknownSizeLines: unknown,
  };
}

/* ------------------------------------------------------------ largest item */

export interface LargestItem {
  item: InventoryItem;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Longest single edge, the dimension most likely to block a doorway. */
  longestEdgeCm: number;
}

/**
 * The item with the longest single edge. Retained for future SpaceFit checks
 * against door width/height, entrance restrictions and floor area — no
 * comparison against host spaces is performed here.
 */
export function largestItem(items: InventoryItem[]): LargestItem | null {
  let best: LargestItem | null = null;
  for (const item of items) {
    const l = num(item.length_cm);
    const w = num(item.width_cm);
    const h = num(item.height_cm);
    if (!l || !w || !h) continue;
    const longest = Math.max(l, w, h);
    if (!best || longest > best.longestEdgeCm) {
      best = { item, lengthCm: l, widthCm: w, heightCm: h, longestEdgeCm: longest };
    }
  }
  return best;
}

/* --------------------------------------------------------------- readiness */

export type ReadinessLevel = "empty" | "partial" | "ready";

export interface Readiness {
  level: ReadinessLevel;
  label: string;
  detail: string;
  /** Search is never blocked purely by missing dimensions. */
  canSearch: boolean;
}

export function inventoryReadiness(items: InventoryItem[]): Readiness {
  if (items.length === 0) {
    return {
      level: "empty",
      label: "Nothing added yet",
      detail: "Add at least one item so we can estimate the space you need.",
      canSearch: false,
    };
  }
  const unknown = items.filter((item) => itemVolumeM3(item) === null).length;
  if (unknown > 0) {
    return {
      level: "partial",
      label: "Some item sizes are unknown",
      detail: `${unknown} ${unknown === 1 ? "item has" : "items have"} no measurements, so the estimate may be low.`,
      canSearch: true,
    };
  }
  return {
    level: "ready",
    label: "Ready to search",
    detail: "Your inventory has enough detail to start looking for space.",
    canSearch: true,
  };
}

/* -------------------------------------------------------------- validation */

export const MAX_DIMENSION_CM = 1500;
export const MAX_QUANTITY = 999;

export function validateQuantity(quantity: number): string | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) return "Enter a whole number.";
  if (quantity < 1) return "Quantity must be at least 1.";
  if (quantity > MAX_QUANTITY) return `Quantity can't be more than ${MAX_QUANTITY}.`;
  return null;
}

/** Dimensions are optional, but if given must be plausible household sizes. */
export function validateDimension(value: number | null, label: string): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return `Please check this ${label.toLowerCase()} measurement.`;
  if (value <= 0) return `${label} must be more than 0 cm.`;
  if (value > MAX_DIMENSION_CM) return `Please check this measurement — ${label.toLowerCase()} looks unusually large.`;
  return null;
}

/* -------------------------------------------------------------- formatting */

/** 4.2 m³ */
export function formatVolume(m3: number | null | undefined, opts: { approx?: boolean } = {}) {
  if (m3 === null || m3 === undefined) return "—";
  const value = m3 < 10 ? m3.toFixed(2).replace(/0$/, "") : m3.toFixed(1);
  return `${opts.approx ? "~" : ""}${Number(value)} m³`;
}

/** 180 × 65 × 110 cm */
export function formatDimensions(
  lengthCm?: number | null,
  widthCm?: number | null,
  heightCm?: number | null,
) {
  const l = num(lengthCm);
  const w = num(widthCm);
  const h = num(heightCm);
  if (!l || !w || !h) return "Size unknown";
  return `${trim(l)} × ${trim(w)} × ${trim(h)} cm`;
}

export const sizeSourceLabel = (source: SizeSource) =>
  source === "user_measured" ? "Using your measurements" : source === "unknown" ? "Size unknown" : "Typical estimate";

export const TRI_STATE_OPTIONS: { value: ItemTriState; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure" },
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  boxes: "Boxes",
  bags: "Bags & suitcases",
  furniture: "Furniture",
  appliances: "Appliances",
  electronics: "Electronics",
  bicycles: "Bicycles",
  sports: "Sports equipment",
  student: "Student belongings",
  business: "Business stock",
  documents: "Documents",
  other: "Other",
};

export const CATEGORY_ORDER: ItemCategory[] = [
  "boxes",
  "bags",
  "furniture",
  "appliances",
  "electronics",
  "bicycles",
  "sports",
  "student",
  "business",
  "documents",
  "other",
];

/* ----------------------------------------------------------------- helpers */

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

function trim(value: number) {
  return Number(value.toFixed(1));
}

export { num as toNumber };
