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
import { formatDate } from "@/lib/format";

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

/* --------------------------------------------------- Minimum booking period */

/**
 * Hosts think in days, weeks or months — the database always stores days, so
 * the UI converts on the way in and back out. A month is 30 days here, matching
 * the pricing engine.
 */
export const STAY_UNIT_DAYS = { day: 1, week: 7, month: 30 } as const;
export type StayUnit = keyof typeof STAY_UNIT_DAYS;

export const STAY_UNITS: { value: StayUnit; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
];

export const stayDays = (count: number, unit: StayUnit): number =>
  Math.max(1, Math.round(count) * STAY_UNIT_DAYS[unit]);

/** Largest whole unit that divides the stored day count exactly. */
export function stayParts(days: number | null | undefined): { count: number; unit: StayUnit } {
  const total = days && days > 0 ? days : 1;
  if (total % STAY_UNIT_DAYS.month === 0) return { count: total / STAY_UNIT_DAYS.month, unit: "month" };
  if (total % STAY_UNIT_DAYS.week === 0) return { count: total / STAY_UNIT_DAYS.week, unit: "week" };
  return { count: total, unit: "day" };
}

/** "1 month", "2 weeks", "10 days" — never "1 months". */
export function formatStay(days: number | null | undefined): string {
  const { count, unit } = stayParts(days);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------ Availability */

export interface AvailabilityWindow {
  availability_mode?: string | null;
  available_from?: string | null;
  available_until?: string | null;
}

/** Plain-English availability, safe for both host preview and public listing. */
export function availabilityLabel(space: AvailabilityWindow): string {
  const mode = space.availability_mode ?? "continuous";
  if (mode !== "dates") return "Available on an ongoing basis";
  const from = space.available_from ? formatDate(space.available_from) : null;
  const until = space.available_until ? formatDate(space.available_until) : null;
  if (from && until) return `Available ${from} to ${until}`;
  if (from) return `Available from ${from}`;
  if (until) return `Available until ${until}`;
  return "Available on an ongoing basis";
}

/** Host-side check before publishing a dates-limited listing. */
export function availabilityProblem(space: AvailabilityWindow): string | null {
  if ((space.availability_mode ?? "continuous") !== "dates") return null;
  if (!space.available_from && !space.available_until) {
    return "Add the dates your space is available, or switch to ongoing availability.";
  }
  if (space.available_from && space.available_until && space.available_until <= space.available_from) {
    return "The last available date must be after the first available date.";
  }
  return null;
}

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
export function publicLocation(area?: string | null, district?: string | null, postcode?: string | null) {
  if (area && area.trim()) return area.trim();
  const code = district ?? districtFromPostcode(postcode);
  if (code) return `${code} area`;
  return "Location on request";
}

/** Mirrors the database trigger so previews match what renters will see. */
export function districtFromPostcode(postcode?: string | null): string | null {
  if (!postcode) return null;
  const raw = postcode.replace(/\s+/g, "").toUpperCase();
  if (raw.length < 5) return null;
  return raw.slice(0, raw.length - 3);
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
