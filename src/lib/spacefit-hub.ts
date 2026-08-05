/**
 * SpaceFit hub + dashboard state (`spacefit-hub-v1`).
 *
 * Pure, deterministic derivation of everything the signed-in SpaceFit surfaces
 * render: the renter's requirement summary and the host's capacity/pricing
 * summary. No AI, no network, no randomness — these views read canonical rows
 * and run the EXISTING engines (`estimateRequiredSpace`, `suggestPrice`).
 *
 * Nothing here ever presents an AI proposal as a verified measurement.
 */
import {
  calculateTotals,
  inventoryReadiness,
  type InventoryItem,
  type InventoryTotals,
  type Readiness,
} from "@/lib/inventory-model";
import { estimateRequiredSpace, type RequiredSpace } from "@/lib/spacefit/requirement";
import { suggestPrice, type PriceSuggestion } from "@/lib/pricing/suggestion";

export const SPACEFIT_HUB_VERSION = "spacefit-hub-v1";

/* --------------------------------------------------------------- renter */

export type RenterSpaceFitState =
  | { state: "empty" }
  | {
      state: "ready";
      totals: InventoryTotals;
      requirement: RequiredSpace;
      readiness: Readiness;
      itemCount: number;
      /** Raw belongings volume, m³. */
      itemVolumeM3: number;
      /** Recommended storage requirement (packing allowance included), m³. */
      requirementM3: number;
    };

/**
 * Renter SpaceFit summary from CONFIRMED inventory items only.
 * An empty inventory is an explicit state, never a blank card.
 */
export function renterSpaceFitState(
  items: InventoryItem[] | null | undefined,
): RenterSpaceFitState {
  const list = items ?? [];
  if (list.length === 0) return { state: "empty" };

  const totals = calculateTotals(list);
  const requirement = estimateRequiredSpace(list);

  return {
    state: "ready",
    totals,
    requirement,
    readiness: inventoryReadiness(list),
    itemCount: totals.itemCount,
    itemVolumeM3: totals.itemVolumeM3,
    requirementM3: requirement.requiredVolumeM3,
  };
}

/* ----------------------------------------------------------------- host */

/** The only fields the SpaceFit host surfaces need from a space row. */
export interface HostSpaceLike {
  id: string;
  title?: string | null;
  space_type?: string | null;
  listing_status?: string | null;
  measurement_source?: string | null;
  measurements_verified_at?: string | null;
  estimated_available_volume_m3?: number | string | null;
  access_type?: string | null;
  moisture_condition?: string | null;
  temperature_condition?: string | null;
  features?: string[] | null;
  updated_at?: string | null;
}

export type HostMeasurementStatus = "host_verified" | "host_entered" | "ai_estimate" | "unmeasured";

export const HOST_MEASUREMENT_LABEL: Record<HostMeasurementStatus, string> = {
  host_verified: "Host verified",
  host_entered: "Entered by you",
  ai_estimate: "AI estimate — needs your confirmation",
  unmeasured: "Not measured yet",
};

/**
 * Measurement trust for a space. An AI proposal is NEVER reported as verified:
 * only an explicit host confirmation earns `host_verified`.
 */
export function hostMeasurementStatus(space: HostSpaceLike): HostMeasurementStatus {
  const source = space.measurement_source ?? null;
  if (source === "host_verified" && space.measurements_verified_at) return "host_verified";
  if (source === "host_verified") return "host_entered";
  if (source === "host_entered") return "host_entered";
  if (source === "ai_estimated") return "ai_estimate";
  return usableVolume(space) === null ? "unmeasured" : "host_entered";
}

export function isVerifiedMeasurement(space: HostSpaceLike): boolean {
  return hostMeasurementStatus(space) === "host_verified";
}

function usableVolume(space: HostSpaceLike): number | null {
  const raw = space.estimated_available_volume_m3;
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface HostSpaceSummary {
  space: HostSpaceLike;
  status: HostMeasurementStatus;
  statusLabel: string;
  verified: boolean;
  published: boolean;
  usableVolumeM3: number | null;
  /** Guidance from the shared deterministic pricing engine — never market data. */
  price: PriceSuggestion;
}

export type HostSpaceFitState =
  | { state: "none" }
  | { state: "proposal" | "verified"; featured: HostSpaceSummary; spaceCount: number };

/** Rank: a verified published space beats a verified draft beats a proposal. */
function rank(space: HostSpaceLike): number {
  const verified = isVerifiedMeasurement(space) ? 2 : 0;
  const published = space.listing_status === "published" ? 1 : 0;
  return verified + published;
}

export function summariseHostSpace(space: HostSpaceLike): HostSpaceSummary {
  const status = hostMeasurementStatus(space);
  const usableVolumeM3 = usableVolume(space);
  return {
    space,
    status,
    statusLabel: HOST_MEASUREMENT_LABEL[status],
    verified: status === "host_verified",
    published: space.listing_status === "published",
    usableVolumeM3,
    price: suggestPrice({
      usableVolumeM3,
      spaceType: space.space_type ?? null,
      accessType: space.access_type ?? null,
      moistureCondition: space.moisture_condition ?? null,
      temperatureCondition: space.temperature_condition ?? null,
      features: space.features ?? null,
    }),
  };
}

export function hostSpaceFitState(spaces: HostSpaceLike[] | null | undefined): HostSpaceFitState {
  const list = (spaces ?? []).filter(Boolean);
  if (list.length === 0) return { state: "none" };

  const featuredRow = list.slice().sort((a, b) => rank(b) - rank(a))[0]!;
  const featured = summariseHostSpace(featuredRow);

  return {
    state: featured.verified ? "verified" : "proposal",
    featured,
    spaceCount: list.length,
  };
}

/** Copy shared by the dashboard card and the hub, so the two can never drift. */
export const SPACEFIT_HUB_COPY = {
  renterEmptyTitle: "Not sure how much storage you need?",
  renterEmptyBody: "Show us your stuff and we'll estimate the space you need.",
  renterReadyLabel: "Your estimated storage requirement",
  hostEmptyTitle: "Wonder what your unused space could earn?",
  hostEmptyBody: "Scan your space to estimate usable capacity and pricing guidance.",
  hostPricingLabel: "Pricing guidance",
  pricingCaveat:
    "*Guidance from your own measurements and features — not market data, and not a promise of income.",
} as const;
