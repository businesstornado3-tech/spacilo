/**
 * SpaceFit matching engine — shared types.
 *
 * The engine is fully deterministic: the same renter inventory and the same
 * host space data must always produce the same result. No AI, no randomness,
 * no network calls inside the engine.
 */
import type { InventoryItem, ItemCategory } from "@/lib/inventory-model";

export const SPACEFIT_ALGORITHM_VERSION = "spacefit-v1";

/** Three distinct states. Missing data is UNKNOWN, never FAIL. */
export type CheckState = "pass" | "fail" | "unknown";

/** Host-space data used for matching. Public-safe fields only. */
export interface MatchSpace {
  id: string;
  title: string | null;
  space_type: string | null;
  postcode_district: string | null;
  approximate_area: string | null;
  monthly_price_pence: number | null;
  estimated_available_volume_m3: number | null;
  total_volume_m3: number | null;
  accepted_categories: string[] | null;
  host_restrictions: string[] | null;
  restriction_notes: string | null;
  features: string[] | null;
  access_type: string | null;
  moisture_condition: string | null;
  temperature_condition: string | null;
  door_width_cm: number | null;
  door_height_cm: number | null;
  photo_count: number | null;
  cover_path: string | null;
}

/** Renter side of the comparison, derived only from CONFIRMED inventory. */
export interface MatchInventory {
  /** Estimated storage requirement in m³ (item volume + packing allowance). */
  storageRequirementM3: number;
  itemVolumeM3: number;
  itemCount: number;
  categories: ItemCategory[];
  items: InventoryItem[];
}

export interface ComponentScore {
  /** Points awarded. */
  score: number;
  /** Maximum points available for this component. */
  max: number;
  /** Renter-facing explanation of the points awarded. */
  detail: string;
  state: CheckState;
}

export type ComponentKey =
  | "capacity"
  | "itemCompatibility"
  | "conditions"
  | "access"
  | "geometry"
  | "completeness";

export interface HardFailure {
  rule: "status" | "capacity" | "accepted_categories" | "host_restriction" | "entrance";
  message: string;
}

export type SpaceFitLabel =
  | "Excellent fit"
  | "Great fit"
  | "Good fit"
  | "Possible fit — check details"
  | "Low-confidence fit — check carefully"
  | "Not suitable";

export interface SpaceFitResult {
  space_id: string;
  algorithm: typeof SPACEFIT_ALGORITHM_VERSION;
  compatible: boolean;
  /** null whenever a hard check failed — never a misleading percentage. */
  score: number | null;
  label: SpaceFitLabel;
  components: Record<ComponentKey, ComponentScore> | null;
  positives: string[];
  warnings: string[];
  hard_failures: HardFailure[];
  /** Deterministic tie-breakers used by ranking. */
  completenessPoints: number;
  pricePence: number | null;
}
