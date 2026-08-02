/**
 * Host listing domain: option sets, labels and capacity maths.
 * Capacity figures are ESTIMATES supplied by the host — never guarantees.
 */
import {
  Warehouse,
  DoorOpen,
  ArrowUpToLine,
  TreePine,
  ArrowDownToLine,
  Boxes,
  Building2,
  Home,
  Shapes,
  type LucideIcon,
} from "lucide-react";

import type { Enums } from "@/integrations/supabase/types";

export type SpaceTypeValue = Enums<"space_type">;
export type ListingStatusValue = Enums<"listing_status">;
export type StorageModeValue = Enums<"storage_mode">;
export type AccessTypeValue = Enums<"space_access_type">;
export type AccessFrequencyValue = Enums<"space_access_frequency">;
export type TriState = Enums<"tri_state">;

export const SPACE_TYPES: { value: SpaceTypeValue; label: string; icon: LucideIcon }[] = [
  { value: "garage", label: "Garage", icon: Warehouse },
  { value: "spare_room", label: "Spare room", icon: DoorOpen },
  { value: "loft", label: "Loft", icon: ArrowUpToLine },
  { value: "shed", label: "Shed", icon: TreePine },
  { value: "basement", label: "Basement", icon: ArrowDownToLine },
  { value: "storage_room", label: "Storage room", icon: Boxes },
  { value: "outbuilding", label: "Outbuilding", icon: Home },
  { value: "commercial", label: "Commercial space", icon: Building2 },
  { value: "other", label: "Other", icon: Shapes },
];

export const spaceTypeLabel = (value?: SpaceTypeValue | null) =>
  SPACE_TYPES.find((t) => t.value === value)?.label ?? "Space";

export const ACCESS_TYPES: { value: AccessTypeValue; label: string; description: string }[] = [
  { value: "by_arrangement", label: "By arrangement", description: "Renters ask you first and you agree a time." },
  { value: "host_present", label: "Host present during access", description: "You'll be there whenever they visit." },
  { value: "daytime", label: "Daytime access", description: "Access during normal daytime hours." },
  { value: "independent", label: "Independent access", description: "They can come and go without you present." },
  { value: "anytime", label: "24/7 access", description: "Access at any time, day or night." },
];

export const accessTypeLabel = (value?: AccessTypeValue | null) =>
  ACCESS_TYPES.find((a) => a.value === value)?.label ?? "By arrangement";

export const ACCESS_FREQUENCIES: { value: AccessFrequencyValue; label: string }[] = [
  { value: "occasional", label: "Occasional" },
  { value: "monthly", label: "Once per month" },
  { value: "few_times_month", label: "A few times per month" },
  { value: "weekly", label: "Weekly" },
  { value: "flexible", label: "Flexible" },
];

export const accessFrequencyLabel = (value?: AccessFrequencyValue | null) =>
  ACCESS_FREQUENCIES.find((a) => a.value === value)?.label ?? null;

/** Host-declared only. Nothing here has been independently verified. */
export const SPACE_FEATURES: { value: string; label: string }[] = [
  { value: "indoor", label: "Indoor" },
  { value: "dry", label: "Dry" },
  { value: "lockable", label: "Lockable" },
  { value: "cctv", label: "CCTV" },
  { value: "alarm", label: "Alarm" },
  { value: "gated", label: "Gated property" },
  { value: "ground_floor", label: "Ground-floor access" },
  { value: "lighting", label: "Lighting" },
  { value: "power", label: "Power available" },
  { value: "smoke_alarm", label: "Smoke alarm" },
  { value: "host_on_site", label: "Host lives at property" },
];

export const featureLabel = (value: string) =>
  SPACE_FEATURES.find((f) => f.value === value)?.label ?? value;

export const ITEM_CATEGORIES: { value: string; label: string }[] = [
  { value: "boxes", label: "Boxes" },
  { value: "suitcases", label: "Suitcases" },
  { value: "furniture", label: "Furniture" },
  { value: "bicycles", label: "Bicycles" },
  { value: "sports", label: "Sports equipment" },
  { value: "student", label: "Student belongings" },
  { value: "household", label: "Household items" },
  { value: "business_stock", label: "Business stock" },
  { value: "documents", label: "Documents" },
  { value: "other", label: "Other" },
];

export const categoryLabel = (value: string) =>
  ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/** Host preferences layered on top of — never replacing — the platform policy. */
export const HOST_RESTRICTIONS: { value: string; label: string }[] = [
  { value: "no_food", label: "No food or perishables" },
  { value: "no_animals", label: "No live animals or plants" },
  { value: "no_vehicles", label: "No vehicles or motorbikes" },
  { value: "no_business_stock", label: "No business stock" },
  { value: "no_large_furniture", label: "No large furniture" },
  { value: "no_frequent_access", label: "No frequent access items" },
];

export const restrictionLabel = (value: string) =>
  HOST_RESTRICTIONS.find((r) => r.value === value)?.label ?? value;

/**
 * Platform-wide prohibited items. Hosts cannot override or remove these —
 * this list is the seed of a future policy service.
 */
export const PLATFORM_PROHIBITED_ITEMS = [
  "Illegal items or substances",
  "Weapons, ammunition or explosives",
  "Flammable, hazardous or toxic materials",
  "Living creatures",
  "Stolen or counterfeit goods",
] as const;

export const TEMPERATURE_OPTIONS: { value: Enums<"temperature_condition">; label: string }[] = [
  { value: "normal_indoor", label: "Normal indoor" },
  { value: "unheated", label: "Unheated" },
  { value: "unknown", label: "Unknown" },
];

export const MOISTURE_OPTIONS: { value: Enums<"moisture_condition">; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "some_humidity", label: "Some humidity possible" },
  { value: "unknown", label: "Unknown" },
];

export const MINIMUM_PERIODS = [1, 2, 3, 6] as const;

/* ------------------------------------------------------------- Capacity */

export interface Dimensions {
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
}

export function floorArea({ length_m, width_m }: Dimensions): number | null {
  if (!length_m || !width_m) return null;
  return Math.round(length_m * width_m * 100) / 100;
}

export function totalVolume(d: Dimensions): number | null {
  const area = floorArea(d);
  if (!area || !d.height_m) return null;
  return Math.round(area * d.height_m * 100) / 100;
}

/** Host-estimated available capacity: total volume scaled by the availability share. */
export function availableVolume(
  d: Dimensions,
  mode: StorageModeValue | null | undefined,
  percentage: number | null | undefined,
): number | null {
  const total = totalVolume(d);
  if (total === null) return null;
  const pct = mode === "partial" ? (percentage ?? 100) : 100;
  return Math.round(total * (pct / 100) * 100) / 100;
}

/**
 * Remaining capacity foundation. Bookings are not implemented yet, so reserved
 * and occupied volumes are always zero — the maths is here so it stays correct
 * once allocation arrives.
 */
export function remainingVolume(
  estimatedAvailable: number | null | undefined,
  reserved: number | null | undefined,
  occupied: number | null | undefined,
): number | null {
  if (estimatedAvailable === null || estimatedAvailable === undefined) return null;
  return Math.max(0, Math.round((estimatedAvailable - (reserved ?? 0) - (occupied ?? 0)) * 100) / 100);
}

export const formatM3 = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)} m³`;

export const formatM2 = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)} m²`;

/** Public location label — never derived from the private address lines. */
export function publicLocation(area?: string | null, district?: string | null) {
  if (area && area.trim()) return area.trim();
  if (district) return `${district} area`;
  return "Location on request";
}

export const LISTING_STATUS_LABEL: Record<ListingStatusValue, string> = {
  draft: "Draft",
  published: "Published",
  paused: "Paused",
  archived: "Archived",
};

export const WIZARD_STEPS = [
  "Space",
  "Size",
  "Photos",
  "Features",
  "Access",
  "Storage rules",
  "Price",
  "Preview",
] as const;
