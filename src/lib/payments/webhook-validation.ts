/**
 * What a verified Stripe event must satisfy before a booking is confirmed
 * (Prompt 11).
 *
 * Signature verification happens first, in the webhook route, using the Stripe
 * SDK and the webhook signing secret. These checks run afterwards against the
 * internal payment record. The database repeats them inside
 * `confirm_booking_payment`, which is the authority; this module keeps the
 * rules readable and unit-testable.
 */

export type WebhookOutcome =
  | "confirmed"
  | "payment_not_found"
  | "already_succeeded"
  | "amount_mismatch"
  | "currency_mismatch"
  | "livemode_mismatch"
  | "not_paid"
  | "duplicate_event";

export interface ExpectedPayment {
  id: string;
  renterTotalAmountPence: number;
  currency: string;
  livemode: boolean | null;
  status: string;
}

export interface ObservedPayment {
  amountPence: number;
  currency: string;
  livemode: boolean;
  paid: boolean;
}

export function validatePaidEvent(
  expected: ExpectedPayment | null | undefined,
  observed: ObservedPayment,
): WebhookOutcome {
  if (!expected) return "payment_not_found";
  if (expected.status === "succeeded") return "already_succeeded";
  if (!observed.paid) return "not_paid";
  if (expected.livemode !== null && expected.livemode !== observed.livemode) {
    return "livemode_mismatch";
  }
  if (expected.renterTotalAmountPence !== observed.amountPence) return "amount_mismatch";
  if (expected.currency.toUpperCase() !== observed.currency.toUpperCase()) {
    return "currency_mismatch";
  }
  return "confirmed";
}

export const confirmsBooking = (outcome: WebhookOutcome): boolean => outcome === "confirmed";

/**
 * Stripe events this endpoint acts on. Anything else is acknowledged with 200
 * and recorded, but changes no financial state.
 */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export const isHandledEvent = (type: string): type is HandledEventType =>
  (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
