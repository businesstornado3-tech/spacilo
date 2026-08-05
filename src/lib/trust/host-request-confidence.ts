/**
 * Host incoming-request confidence (Prompt 23F).
 *
 * Everything a host needs to answer one question — "should I accept this?" —
 * derived ONLY from the request's frozen snapshots. No live listing lookup, no
 * live inventory read, no recalculation: the figures a host judges by must be
 * the same ones the renter saw when they sent the request.
 *
 * Privacy: the renter's inventory is summarised, never exposed. Photos, item
 * ids, AI detection metadata, confidence scores and free-text notes stay out of
 * the host's view entirely.
 */
import { formatPrice } from "@/lib/format";
import { snapshotItems, largestItemSnapshot, type StorageRequest } from "@/lib/storage-requests";
import { CHECK_STATE_TEXT, type CheckKey, type CheckState } from "@/lib/trust/listing-confidence";

/* ------------------------------------------------- capacity vs requirement */

export interface CapacityComparison {
  requirementM3: number | null;
  capacityM3: number | null;
  /** Capacity minus requirement, m³. Null when either side is unknown. */
  headroomM3: number | null;
  state: "fits" | "tight" | "over" | "unknown";
  headline: string;
  detail: string;
}

const fmt = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)} m³`;

/** Tight means the items would use more than 85% of the stated capacity. */
const TIGHT_RATIO = 0.85;

export function capacityComparison(request: StorageRequest): CapacityComparison {
  const requirement = Number(request.estimated_storage_requirement_m3_snapshot);
  const capacityRaw = request.space_available_capacity_m3_snapshot;
  const capacity = capacityRaw === null || capacityRaw === undefined ? null : Number(capacityRaw);
  const requirementOk = Number.isFinite(requirement) && requirement > 0;

  if (!requirementOk || capacity === null || !Number.isFinite(capacity) || capacity <= 0) {
    return {
      requirementM3: requirementOk ? requirement : null,
      capacityM3: capacity !== null && Number.isFinite(capacity) ? capacity : null,
      headroomM3: null,
      state: "unknown",
      headline: "Capacity comparison unavailable",
      detail: "This request doesn't have both a requirement and a usable capacity recorded.",
    };
  }

  const headroom = Math.round((capacity - requirement) * 100) / 100;
  const ratio = requirement / capacity;

  if (ratio > 1) {
    return {
      requirementM3: requirement,
      capacityM3: capacity,
      headroomM3: headroom,
      state: "over",
      headline: `Needs ${fmt(requirement)} — more than your ${fmt(capacity)}`,
      detail: `Their estimated requirement is ${fmt(Math.abs(headroom))} more than the usable capacity recorded for this space.`,
    };
  }
  if (ratio >= TIGHT_RATIO) {
    return {
      requirementM3: requirement,
      capacityM3: capacity,
      headroomM3: headroom,
      state: "tight",
      headline: `Needs ${fmt(requirement)} of your ${fmt(capacity)}`,
      detail: `That's a tight fit — about ${fmt(headroom)} spare.`,
    };
  }
  return {
    requirementM3: requirement,
    capacityM3: capacity,
    headroomM3: headroom,
    state: "fits",
    headline: `Needs ${fmt(requirement)} of your ${fmt(capacity)}`,
    detail: `That leaves about ${fmt(headroom)} spare.`,
  };
}

/* ------------------------------------------------------ snapshot checks */

export interface HostCheck {
  key: CheckKey;
  label: string;
  state: CheckState;
  statusText: string;
  detail: string;
}

interface CompatibilitySnapshot {
  policy_version?: string | null;
  policy_status?: string | null;
  suitability_known?: boolean | null;
  suitability_warnings?: unknown;
  physical_fit?: { spacefit_score?: number | null; spacefit_label?: string | null } | null;
}

function compatSnapshot(request: StorageRequest): CompatibilitySnapshot {
  const raw = request.compatibility_snapshot;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as unknown as CompatibilitySnapshot)
    : {};
}

export function suitabilityWarnings(request: StorageRequest): string[] {
  const raw = compatSnapshot(request).suitability_warnings;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const message = record["message"] ?? record["detail"] ?? record["reason"];
        return typeof message === "string" ? message : null;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

interface ScreeningSnapshot {
  blocked?: boolean | null;
  action_required?: boolean | null;
  items?: { message?: string | null; decision?: string | null }[] | null;
}

function screeningSnapshot(request: StorageRequest): ScreeningSnapshot | null {
  const raw = request.policy_screening_snapshot;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as unknown as ScreeningSnapshot)
    : null;
}

/** FIT / POLICY / SUITABILITY, read back from the frozen request. */
export function hostConfidenceChecks(request: StorageRequest): HostCheck[] {
  const capacity = capacityComparison(request);
  const compat = compatSnapshot(request);
  const screening = screeningSnapshot(request);
  const warnings = suitabilityWarnings(request);

  const fitState: CheckState =
    capacity.state === "over"
      ? "fail"
      : capacity.state === "tight"
        ? "note"
        : capacity.state === "unknown"
          ? "unknown"
          : "pass";

  const scoreLabel = request.spacefit_label_snapshot;
  const score = request.spacefit_score_snapshot;
  const fitDetail =
    score === null || score === undefined
      ? capacity.detail
      : `Fit ${score}%${scoreLabel ? ` — ${scoreLabel}` : ""}. ${capacity.detail}`;

  const policyState: CheckState = screening?.blocked
    ? "blocked"
    : screening?.action_required
      ? "action"
      : compat.policy_version
        ? "pass"
        : "unknown";

  const policyDetail = screening?.blocked
    ? "The storage policy blocks part of this request."
    : screening?.action_required
      ? "Some items need the renter to confirm details under the storage policy."
      : compat.policy_version
        ? `Screened against storage policy ${compat.policy_version} when the request was sent.`
        : "No policy screening was recorded for this request.";

  const suitabilityState: CheckState = !compat.suitability_known
    ? "unknown"
    : warnings.length > 0
      ? "note"
      : "pass";

  return [
    {
      key: "fit",
      label: "Physical fit",
      state: fitState,
      statusText: CHECK_STATE_TEXT[fitState],
      detail: fitDetail,
    },
    {
      key: "policy",
      label: "Storage policy",
      state: policyState,
      statusText: CHECK_STATE_TEXT[policyState],
      detail: policyDetail,
    },
    {
      key: "suitability",
      label: "Your space's suitability",
      state: suitabilityState,
      statusText: CHECK_STATE_TEXT[suitabilityState],
      detail: !compat.suitability_known
        ? "You hadn't described this space's suitability when the request was sent."
        : warnings.length > 0
          ? warnings.join(" ")
          : "Nothing in what you declared conflicts with what they're storing.",
    },
  ];
}

/* --------------------------------------------------- renter declaration */

export interface DeclarationStatus {
  complete: boolean;
  policyVersion: string | null;
  lines: { label: string; confirmed: boolean }[];
  summary: string;
}

export function declarationStatus(request: StorageRequest): DeclarationStatus {
  const raw = request.renter_declaration_snapshot;
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const lines = [
    { label: "Their list is accurate and complete", confirmed: record?.["accurate"] === true },
    { label: "No prohibited items", confirmed: record?.["no_prohibited_items"] === true },
    { label: "Accepted the storage policy", confirmed: record?.["accepts_policy"] === true },
  ];
  const complete = lines.every((line) => line.confirmed);
  const version =
    typeof record?.["policy_version"] === "string" ? (record["policy_version"] as string) : null;

  return {
    complete,
    policyVersion: version ?? request.policy_version_snapshot ?? null,
    lines,
    summary: complete
      ? `Renter confirmed all storage declarations${version ? ` under policy ${version}` : ""}.`
      : "Some storage declarations weren't confirmed.",
  };
}

/* ------------------------------------------------- inventory (bounded) */

/** The ONLY item fields a host may see. Everything else stays private. */
export const HOST_VISIBLE_ITEM_FIELDS = [
  "label",
  "category",
  "quantity",
  "estimated_volume_m3",
] as const;

export interface InventoryLine {
  label: string;
  category: string;
  quantity: number;
  volumeM3: number | null;
}

export interface HostInventorySummary {
  itemCount: number;
  lineCount: number;
  lines: InventoryLine[];
  categories: string[];
  largestItem: { label: string; dimensions: string } | null;
  /** Always shown, so the host knows this is a summary and not the full record. */
  privacyNote: string;
}

const PRIVACY_NOTE =
  "A summary of what they plan to store. Photos and personal details stay private.";

export function hostInventorySummary(request: StorageRequest, lineLimit = 8): HostInventorySummary {
  const items = snapshotItems(request);
  const lines: InventoryLine[] = items.slice(0, lineLimit).map((item) => ({
    label: item.label,
    category: item.category,
    quantity: item.quantity,
    volumeM3:
      item.estimated_volume_m3 === null || item.estimated_volume_m3 === undefined
        ? null
        : Number(item.estimated_volume_m3),
  }));

  const categories: string[] = [];
  for (const item of items) {
    if (item.category && !categories.includes(item.category)) categories.push(item.category);
  }

  const largest = largestItemSnapshot(request);
  const dims =
    largest && largest.length_cm && largest.width_cm && largest.height_cm
      ? `${largest.length_cm} × ${largest.width_cm} × ${largest.height_cm} cm`
      : null;

  return {
    itemCount: request.inventory_item_count_snapshot,
    lineCount: request.inventory_line_count_snapshot,
    lines,
    categories: categories.sort(),
    largestItem: largest && dims ? { label: largest.label, dimensions: dims } : null,
    privacyNote: PRIVACY_NOTE,
  };
}

/* ----------------------------------------------------------- earnings */

export type EarningsState = "potential" | "earned" | "paid" | "none";

export interface HostEarningsView {
  state: EarningsState;
  label: string;
  amount: string | null;
  amountPence: number | null;
  detail: string;
  /** Period the amount covers, straight from the request snapshot. */
  periodDays: number | null;
}

/**
 * What this request is worth to the host, from the frozen pricing snapshot.
 * Nothing is hard-coded and nothing is recomputed: `storage_amount_pence` is
 * the host's share as calculated when the request was created.
 */
export function hostEarningsView(request: StorageRequest): HostEarningsView {
  const pence = request.storage_amount_pence;
  const days = request.duration_days_snapshot ?? null;
  const amount = pence === null || pence === undefined ? null : formatPrice(pence);

  if (amount === null) {
    return {
      state: "none",
      label: "Earnings",
      amount: null,
      amountPence: null,
      detail: "No price was recorded for this request.",
      periodDays: days,
    };
  }

  switch (request.status) {
    case "pending":
      return {
        state: "potential",
        label: "Potential earnings",
        amount,
        amountPence: pence,
        detail:
          "What you'd earn for the requested period if you accept and the renter pays. Nothing is earned yet.",
        periodDays: days,
      };
    case "accepted":
    case "reserved":
      return {
        state: "potential",
        label: "Potential earnings",
        amount,
        amountPence: pence,
        detail: "Not earned yet — the renter still has to pay to confirm the booking.",
        periodDays: days,
      };
    case "confirmed":
    case "active":
      return {
        state: "earned",
        label: "Earning from this booking",
        amount,
        amountPence: pence,
        detail: "Earned across the booking. Payouts are released on the usual schedule.",
        periodDays: days,
      };
    case "completed":
      return {
        state: "paid",
        label: "Earned from this booking",
        amount,
        amountPence: pence,
        detail: "This booking has finished. Check Earnings for what's been paid out.",
        periodDays: days,
      };
    default:
      return {
        state: "none",
        label: "Earnings",
        amount: null,
        amountPence: null,
        detail: "This request won't produce any earnings.",
        periodDays: days,
      };
  }
}

/* ------------------------------------------------------- next action */

export interface NextAction {
  headline: string;
  detail: string;
}

/** Deterministic next-step guidance for the host, based on request status. */
export function hostNextAction(request: StorageRequest, respondable: boolean): NextAction {
  if (respondable) {
    return {
      headline: "Accept or decline this request",
      detail: "No money moves until you accept and the renter pays.",
    };
  }
  switch (request.status) {
    case "accepted":
    case "reserved":
      return {
        headline: "Waiting for the renter to pay",
        detail: "The booking is confirmed once their payment goes through.",
      };
    case "confirmed":
      return {
        headline: "Get ready for handover",
        detail: "Agree access with the renter for the start of the booking.",
      };
    case "active":
      return { headline: "Booking under way", detail: "Nothing to do right now." };
    case "completed":
      return { headline: "Booking finished", detail: "You can leave a review for the renter." };
    case "declined":
      return { headline: "You declined this request", detail: "No further action needed." };
    case "withdrawn":
      return { headline: "The renter withdrew this request", detail: "No further action needed." };
    case "expired":
      return {
        headline: "This request expired",
        detail: "It wasn't answered in time, so it closed automatically.",
      };
    default:
      return { headline: "No action needed", detail: "Nothing to do right now." };
  }
}

/** Compact one-liner for dashboard cards. */
export function compactConfidenceLine(request: StorageRequest): string {
  const capacity = capacityComparison(request);
  const score = request.spacefit_score_snapshot;
  const fit = score === null || score === undefined ? "Fit not recorded" : `Fit ${score}%`;
  return `${fit} · ${capacity.headline}`;
}
