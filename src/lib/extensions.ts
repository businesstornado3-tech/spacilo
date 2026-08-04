/**
 * Booking extensions — presentation-only helpers (Prompt 16).
 *
 * All money, dates, availability and status transitions are decided in the
 * database (`request_booking_extension`, `respond_to_booking_extension`,
 * `begin_extension_checkout`, `confirm_booking_payment`). Nothing here is
 * authoritative; it only turns those authoritative rows into plain English.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ExtensionRow = Tables<"booking_change_requests">;
export type ExtensionAudience = "renter" | "host";

/** Statuses that block a new request: one actionable extension at a time. */
export const OPEN_EXTENSION_STATUSES = ["pending", "accepted_awaiting_payment"] as const;

export function openExtension(rows: ExtensionRow[]): ExtensionRow | null {
  return (
    rows.find((row) => (OPEN_EXTENSION_STATUSES as readonly string[]).includes(row.status)) ?? null
  );
}

/**
 * Plain-language status. Internal database and Stripe names never reach the UI.
 */
export function extensionStatusLabel(status: string, audience: ExtensionAudience): string {
  switch (status) {
    case "pending":
      return audience === "host" ? "Extension requested" : "Waiting for host";
    case "accepted_awaiting_payment":
      return audience === "host" ? "Waiting for renter payment" : "Host accepted — payment required";
    case "applied":
      return "Extension confirmed";
    case "declined":
      return "Declined";
    case "withdrawn":
      return "Cancelled";
    default:
      return "Extension";
  }
}

/** Only a confirmed extension may ever read as confirmed. */
export function isExtensionConfirmed(row: ExtensionRow): boolean {
  return row.status === "applied";
}

/**
 * What the host earns from the extension: the extra storage only. The
 * {@link https://stripe.com Stripe} service fee is paid by the renter on top
 * and is never deducted from the host.
 */
export function extensionHostEarningsPence(row: ExtensionRow): number {
  return row.additional_storage_amount_pence ?? 0;
}

/** A booking can only be extended while it is live and unfinished. */
export function bookingAcceptsExtensions(status: string): boolean {
  return status === "confirmed" || status === "active";
}
