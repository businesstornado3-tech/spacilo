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

/**
 * Stripe Connect account lifecycle events (Prompt 12). Delivered to this same
 * endpoint when "listen to events on connected accounts" is enabled, so the
 * existing signature verification and event-id idempotency both still apply.
 */
export const CONNECT_EVENT_TYPES = ["account.updated"] as const;

export type ConnectEventType = (typeof CONNECT_EVENT_TYPES)[number];

export const isConnectAccountEvent = (type: string): type is ConnectEventType =>
  (CONNECT_EVENT_TYPES as readonly string[]).includes(type);

/** Refund events that must adjust a not-yet-transferred host earning. */
export const REFUND_EVENT_TYPES = ["charge.refunded"] as const;

export type RefundEventType = (typeof REFUND_EVENT_TYPES)[number];

export const isRefundEvent = (type: string): type is RefundEventType =>
  (REFUND_EVENT_TYPES as readonly string[]).includes(type);

/**
 * Dispute lifecycle events (Prompt 13). A dispute puts money at risk, so an
 * affected earning is held until Stripe tells us the outcome.
 */
export const DISPUTE_EVENT_TYPES = [
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const;

export type DisputeEventType = (typeof DISPUTE_EVENT_TYPES)[number];

export const isDisputeEvent = (type: string): type is DisputeEventType =>
  (DISPUTE_EVENT_TYPES as readonly string[]).includes(type);

/** Only `charge.dispute.closed` carries Stripe's final won/lost outcome. */
export const isDisputeClosedEvent = (type: string): boolean =>
  type === "charge.dispute.closed";

/**
 * Every Stripe event type this endpoint acts on. Enable exactly these in the
 * Stripe dashboard — nothing broader is required.
 */
export const ALL_SUBSCRIBED_EVENT_TYPES = [
  ...HANDLED_EVENT_TYPES,
  ...CONNECT_EVENT_TYPES,
  ...REFUND_EVENT_TYPES,
  ...DISPUTE_EVENT_TYPES,
] as const;
