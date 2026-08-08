/**
 * Planner capabilities.
 *
 * One planner, three audiences. Every gate in the UI reads a capability flag
 * rather than checking auth directly, so the same components serve the public
 * demo, the renter dashboard and the host review panel without branching on
 * who is looking. Future premium tiers add flags here, nothing else moves.
 */

export type PlannerMode = "visitor" | "renter" | "host";

export interface PlannerCapabilities {
  mode: PlannerMode;
  /** Distinct catalogue lines a planner session may hold. */
  maxItemTypes: number;
  canUploadPhotos: boolean;
  canUseRecognition: boolean;
  canSavePlans: boolean;
  canCompareSpaces: boolean;
  canKeepHistory: boolean;
  canBook: boolean;
  /** Host-only decision surface (accept / accept with changes / decline). */
  canReviewBooking: boolean;
  /** Reserved for future subscription tiers — never gated in the UI today. */
  premium: boolean;
}

const VISITOR: PlannerCapabilities = {
  mode: "visitor",
  maxItemTypes: 4,
  canUploadPhotos: false,
  canUseRecognition: false,
  canSavePlans: false,
  canCompareSpaces: false,
  canKeepHistory: false,
  canBook: false,
  canReviewBooking: false,
  premium: false,
};

const RENTER: PlannerCapabilities = {
  mode: "renter",
  maxItemTypes: Number.POSITIVE_INFINITY,
  canUploadPhotos: true,
  canUseRecognition: true,
  canSavePlans: true,
  canCompareSpaces: true,
  canKeepHistory: true,
  canBook: true,
  canReviewBooking: false,
  premium: false,
};

const HOST: PlannerCapabilities = {
  ...RENTER,
  mode: "host",
  canCompareSpaces: false,
  canBook: false,
  canReviewBooking: true,
};

export function capabilitiesFor(mode: PlannerMode): PlannerCapabilities {
  if (mode === "renter") return RENTER;
  if (mode === "host") return HOST;
  return VISITOR;
}

/** What a visitor unlocks by creating an account. Shown on the unlock card. */
export const UNLOCK_BENEFITS = [
  "Unlimited belongings",
  "AI photo recognition",
  "Unlimited packing plans",
  "Save inventories",
  "Compare nearby spaces",
  "Booking confidence reports",
  "Host income estimation",
  "AI recommendations",
] as const;
