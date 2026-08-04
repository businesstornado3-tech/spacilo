/**
 * Early termination of an ACTIVE booking (Prompt 17) — pure helpers.
 *
 * Ending storage early is a two-party agreement, not a cancellation. One party
 * proposes an earlier end date; the booking's dates change only when the other
 * party agrees, and only inside `respond_to_early_termination`. Nothing here
 * decides money: active-booking refunds are handled separately.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ChangeRequestRow = Tables<"booking_change_requests">;
export type Party = "renter" | "host";

export const EARLY_TERMINATION_KIND = "early_termination";

export const isEarlyTerminationRow = (row: ChangeRequestRow): boolean =>
  row.kind === EARLY_TERMINATION_KIND;

/** The one request that is still waiting for an answer, if any. */
export function openEarlyTermination(rows: ChangeRequestRow[]): ChangeRequestRow | null {
  return rows.find((row) => isEarlyTerminationRow(row) && row.status === "pending") ?? null;
}

/** The most recent agreed early end, if one was reached. */
export function agreedEarlyTermination(rows: ChangeRequestRow[]): ChangeRequestRow | null {
  const agreed = rows.filter((row) => isEarlyTerminationRow(row) && row.status === "applied");
  return agreed.length > 0 ? (agreed[agreed.length - 1] as ChangeRequestRow) : null;
}

/** Only the party who did NOT ask may answer. */
export function canRespond(row: ChangeRequestRow, viewerId: string | null | undefined): boolean {
  if (!viewerId) return false;
  if (row.status !== "pending") return false;
  if (row.requested_by === viewerId) return false;
  return row.renter_id === viewerId || row.host_id === viewerId;
}

export type ProposalRejection =
  | "not_active"
  | "missing_date"
  | "not_earlier"
  | "before_start"
  | "already_open";

export interface ProposalCheck {
  ok: boolean;
  reason?: ProposalRejection;
}

/**
 * Mirrors the database validation so the UI can explain itself. The server
 * repeats every one of these checks under a row lock.
 */
export function checkProposal(
  booking: { status: string; start_date: string; end_date: string },
  proposedEndDate: string,
  openRequest: ChangeRequestRow | null,
): ProposalCheck {
  if (booking.status !== "active") return { ok: false, reason: "not_active" };
  if (openRequest) return { ok: false, reason: "already_open" };
  const date = proposedEndDate?.slice(0, 10);
  if (!date) return { ok: false, reason: "missing_date" };
  if (date >= booking.end_date.slice(0, 10)) return { ok: false, reason: "not_earlier" };
  if (date < booking.start_date.slice(0, 10)) return { ok: false, reason: "before_start" };
  return { ok: true };
}

export const PROPOSAL_MESSAGE: Record<ProposalRejection, string> = {
  not_active: "Storage hasn't started yet, so this booking is cancelled rather than ended early.",
  missing_date: "Choose the date you'd like storage to end.",
  not_earlier: "Choose a date before the current end date.",
  before_start: "Choose a date on or after the storage start date.",
  already_open: "There's already an early end request waiting for an answer.",
};

/** Role-aware wording. Project Stow never adjudicates between the parties. */
export function earlyTerminationStatusLabel(
  row: ChangeRequestRow,
  viewer: Party,
): string {
  const mine = row.requested_by_role === viewer;
  switch (row.status) {
    case "pending":
      return mine ? "Early end requested" : "Early end requested by the other party";
    case "applied":
      return "Early end agreed";
    case "declined":
      return "Early end declined";
    case "withdrawn":
      return "Early end request closed";
    default:
      return "Early end request";
  }
}

export const EARLY_TERMINATION_LIFECYCLE_COPY =
  "The booking stays active until collection is confirmed, so check-out photos, notes and confirmations all work as normal.";

export const SERIOUS_PROBLEM_COPY =
  "If something is seriously wrong, report a problem instead — that record goes to the {brand} team rather than waiting on the other party.";
