/**
 * Who may start checkout, and for which booking (Prompt 11).
 *
 * The database enforces the same rules inside `begin_booking_checkout` under
 * the caller's own identity; this module keeps them testable and lets the UI
 * explain itself without a round trip.
 */
import type { BookingStatus } from "@/lib/bookings";

export type CheckoutRejection =
  | "not_authenticated"
  | "not_the_renter"
  | "booking_missing"
  | "not_awaiting_payment"
  | "no_agreed_price";

export interface CheckoutSubject {
  id: string;
  renterId: string;
  status: BookingStatus;
  storageAmountPence: number | null;
}

export interface CheckoutEligibility {
  allowed: boolean;
  reason?: CheckoutRejection;
}

export function checkoutEligibility(
  booking: CheckoutSubject | null | undefined,
  callerId: string | null | undefined,
): CheckoutEligibility {
  if (!callerId) return { allowed: false, reason: "not_authenticated" };
  if (!booking) return { allowed: false, reason: "booking_missing" };
  if (booking.renterId !== callerId) return { allowed: false, reason: "not_the_renter" };
  if (booking.status !== "pending_payment") {
    return { allowed: false, reason: "not_awaiting_payment" };
  }
  if (!booking.storageAmountPence || booking.storageAmountPence <= 0) {
    return { allowed: false, reason: "no_agreed_price" };
  }
  return { allowed: true };
}

export const CHECKOUT_REJECTION_MESSAGE: Record<CheckoutRejection, string> = {
  not_authenticated: "Sign in to pay for this booking.",
  not_the_renter: "Only the renter who made this booking can pay for it.",
  booking_missing: "We couldn't find that booking.",
  not_awaiting_payment: "This booking isn't awaiting payment.",
  no_agreed_price: "This booking doesn't have an agreed price yet.",
};

/** Can the renter see the exact address? Confirmed AND actually paid. */
export function exactAddressReleased(
  booking: { status: BookingStatus; renter_id: string } | null | undefined,
  viewerId: string | null | undefined,
  hasSucceededPayment: boolean,
): boolean {
  if (!viewerId || !booking) return false;
  if (booking.renter_id !== viewerId) return false;
  if (booking.status !== "confirmed") return false;
  return hasSucceededPayment;
}
