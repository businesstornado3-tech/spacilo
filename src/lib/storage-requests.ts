/**
 * Storage request domain helpers (Prompt 9).
 *
 * A storage request is a SNAPSHOT: once created, every figure it shows comes
 * from the request row itself, never from the live space or live inventory.
 * The helpers below are pure so the snapshot guarantee is unit-testable.
 *
 * A request is NOT a booking, NOT a payment and does NOT reserve capacity.
 */
import type { Tables } from "@/integrations/supabase/types";
import { formatDate, formatPrice } from "@/lib/format";

export type StorageRequest = Tables<"storage_requests">;
export type StorageRequestStatus = StorageRequest["status"];

/** How long a pending request waits for the host before expiring. */
export const REQUEST_EXPIRY_HOURS = 48;

export const REQUEST_NOTE_MAX = 500;

/** Pre-send copy: shown before a request exists, so it is always "pending". */
export const REQUEST_DISCLAIMER =
  "Estimates only. Sending a request doesn't book the space or take payment. The host still needs to respond.";

/** Mixed-status lists: no single status applies, so stay status-neutral. */
export const REQUEST_LIST_DISCLAIMER =
  "Estimates only. A request isn't a booking or a payment.";

/** Status-aware explanatory copy for a single request. */
const RENTER_STATUS_NOTE: Record<string, string> = {
  pending: "Sending a request doesn't book the space or take payment. The host still needs to respond.",
  accepted: "The host accepted this request. It isn't a booking or a payment yet.",
  declined: "The host declined this request. No booking or payment was created.",
  withdrawn: "This request was withdrawn. No booking or payment was created.",
  expired: "This request expired before it was accepted. No booking or payment was created.",
};

const HOST_STATUS_NOTE: Record<string, string> = {
  pending: "Responding to a request doesn't create a booking or take payment yet.",
  accepted: "You accepted this request. A booking and payment have not been created yet.",
  declined: "You declined this request. No booking or payment was created.",
  withdrawn: "This request was withdrawn. No booking or payment was created.",
  expired: "This request expired before it was accepted. No booking or payment was created.",
};

export function requestStatusNote(
  request: Pick<StorageRequest, "status" | "expires_at">,
  audience: "renter" | "host" = "renter",
  now: Date = new Date(),
): string {
  const status = effectiveStatus(request, now);
  const table = audience === "host" ? HOST_STATUS_NOTE : RENTER_STATUS_NOTE;
  return `Estimates only. ${table[status] ?? REQUEST_LIST_DISCLAIMER}`;
}

type Tone = "neutral" | "warning" | "success" | "destructive" | "info";

export const REQUEST_STATUS_META: Record<string, { label: string; tone: Tone; detail: string }> = {
  pending: {
    label: "Pending",
    tone: "warning",
    detail: "The host has your request and hasn't responded yet.",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "neutral",
    detail: "You withdrew this request.",
  },
  expired: {
    label: "Expired",
    tone: "neutral",
    detail: "The host didn't respond in time, so this request expired.",
  },
  accepted: {
    label: "Accepted",
    tone: "success",
    detail: "The host accepted this request. It isn't a booking or a payment yet.",
  },
  declined: {
    label: "Declined",
    tone: "destructive",
    detail: "The host declined this request.",
  },
};

/** Host-facing wording for the same canonical statuses. */
export const HOST_STATUS_DETAIL: Record<string, string> = {
  pending: "This renter is waiting for your response.",
  accepted: "You accepted this request. No booking or payment has been created yet.",
  declined: "You declined this request.",
  withdrawn: "The renter withdrew this request before you responded.",
  expired: "This request expired before it was answered.",
};

export const hostStatusDetail = (status: string) => HOST_STATUS_DETAIL[status] ?? "";

export const statusMeta = (status: string) =>
  REQUEST_STATUS_META[status] ?? { label: status, tone: "neutral" as Tone, detail: "" };

/** Can the host still accept or decline? Mirrors the server-side guard. */
export const isRespondable = (
  request: Pick<StorageRequest, "status" | "expires_at">,
  now: Date = new Date(),
) => effectiveStatus(request, now) === "pending";

/** Requests genuinely awaiting a host response — the canonical pending count. */
export function pendingForHost<T extends Pick<StorageRequest, "status" | "expires_at">>(
  requests: T[],
  now: Date = new Date(),
): T[] {
  return requests.filter((request) => effectiveStatus(request, now) === "pending");
}


/**
 * Status as the renter should see it. The database expires stale rows in
 * batches, so a pending row past its expiry always presents as expired.
 */
export function effectiveStatus(
  request: Pick<StorageRequest, "status" | "expires_at">,
  now: Date = new Date(),
): StorageRequestStatus {
  if (request.status === "pending" && new Date(request.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return request.status;
}

export const isWithdrawable = (
  request: Pick<StorageRequest, "status" | "expires_at">,
  now: Date = new Date(),
) => effectiveStatus(request, now) === "pending";

/* ------------------------------------------------------------------ dates */

/** YYYY-MM-DD for a date input, in local time. */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface DateErrors {
  start?: string;
  end?: string;
}

/** Mirror of the server-side date rules, so the renter gets fast feedback. */
export function validateRequestDates(
  start: string,
  end: string,
  today: Date = new Date(),
): DateErrors {
  const errors: DateErrors = {};
  const todayKey = toDateInput(today);

  if (!start) errors.start = "Choose a start date.";
  else if (start < todayKey) errors.start = "The start date can't be in the past.";

  if (!end) errors.end = "Choose an end date.";
  else if (start && end <= start) errors.end = "The end date must be after the start date.";

  return errors;
}

export const hasDateErrors = (errors: DateErrors) => Boolean(errors.start || errors.end);

/** "15 September 2026 to 15 December 2026" */
export function formatRequestPeriod(start: string, end: string) {
  return `${formatDate(start)} to ${formatDate(end)}`;
}

/**
 * Approximate length of the requested period, in months.
 * Presentational only: Prompt 9 deliberately shows a monthly price and a
 * duration rather than a precise total, because partial-month billing has not
 * been designed yet.
 */
export function approximateMonths(start: string, end: string): number {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round((days / 30.4375) * 10) / 10;
}

/**
 * Human-readable length of the period. Never produces "1 months": whole units
 * are singularised, so a 30-day stay reads "about 1 month".
 */
export function formatApproximateDuration(start: string, end: string) {
  const months = approximateMonths(start, end);
  if (months <= 0) return "";
  if (months < 1) return "less than a month";
  if (months % 1 === 0) return `about ${months} month${months === 1 ? "" : "s"}`;
  return `about ${months.toFixed(1)} months`;
}

/** "Host response requested by 17 September 2026" */
export function expiryLabel(request: Pick<StorageRequest, "status" | "expires_at">) {
  if (effectiveStatus(request) !== "pending") return null;
  return `Host response requested by ${formatDate(request.expires_at)}`;
}

/* -------------------------------------------------------------- snapshots */

export interface SnapshotItem {
  catalogue_key: string | null;
  label: string;
  category: string;
  quantity: number;
  estimated_volume_m3: number | null;
}

export function snapshotItems(request: Pick<StorageRequest, "inventory_items_snapshot">): SnapshotItem[] {
  const raw = request.inventory_items_snapshot;
  return Array.isArray(raw) ? (raw as unknown as SnapshotItem[]) : [];
}

export interface LargestItemSnapshot {
  label: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  longest_edge_cm: number | null;
}

export function largestItemSnapshot(
  request: Pick<StorageRequest, "largest_item_snapshot">,
): LargestItemSnapshot | null {
  const raw = request.largest_item_snapshot;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as unknown as LargestItemSnapshot)
    : null;
}

/**
 * The single read model every request surface uses. Nothing here consults the
 * live space or live inventory, which is exactly what keeps history honest.
 */
export interface RequestSnapshotView {
  status: StorageRequestStatus;
  spaceTitle: string;
  spaceType: string | null;
  area: string | null;
  period: string;
  priceLabel: string;
  monthlyPricePence: number | null;
  itemCount: number;
  requirementM3: number;
  capacityM3: number | null;
  spaceFitScore: number | null;
  spaceFitLabel: string | null;
  note: string | null;
}

export function requestSnapshotView(request: StorageRequest, now: Date = new Date()): RequestSnapshotView {
  return {
    status: effectiveStatus(request, now),
    spaceTitle: request.space_title_snapshot ?? "Storage space",
    spaceType: request.space_type_snapshot,
    area: request.space_area_snapshot ?? request.space_postcode_district_snapshot,
    period: formatRequestPeriod(request.requested_start_date, request.requested_end_date),
    priceLabel:
      request.monthly_price_snapshot === null
        ? "Price not published"
        : `${formatPrice(request.monthly_price_snapshot)}/month`,
    monthlyPricePence: request.monthly_price_snapshot,
    itemCount: request.inventory_item_count_snapshot,
    requirementM3: Number(request.estimated_storage_requirement_m3_snapshot),
    capacityM3:
      request.space_available_capacity_m3_snapshot === null
        ? null
        : Number(request.space_available_capacity_m3_snapshot),
    spaceFitScore: request.spacefit_score_snapshot,
    spaceFitLabel: request.spacefit_label_snapshot,
    note: request.renter_note,
  };
}
