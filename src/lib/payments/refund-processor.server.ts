/**
 * Refund execution — server only (Prompt 13).
 *
 * Concurrency strategy (claim → API → reconcile):
 *
 *  1. `cancel_booking` runs in ONE database transaction. It locks the booking,
 *     the succeeded payment and the host earning with FOR UPDATE, writes a
 *     durable cancellation + a `pending` refund row, and holds the earning.
 *     The payout processor claims earnings with FOR UPDATE SKIP LOCKED, so it
 *     simply skips a row we are holding — only one of refund / transfer wins.
 *  2. A partial unique index (`booking_refunds_one_pending_per_payment`)
 *     guarantees at most one in-flight refund per payment, so a double-clicked
 *     cancellation cannot produce two Stripe refunds even across processes.
 *  3. The Stripe call happens AFTER that transaction commits, never inside it,
 *     and uses an idempotency key derived from the immutable refund row id.
 *     A retry after a timeout replays the original Stripe refund.
 *  4. The signed `charge.refunded` webhook is the authority for completion; it
 *     applies only the DELTA against amounts already recorded.
 *
 * If Stripe is unavailable the refund row stays `pending` with a failure
 * reason — a recoverable state, never an ambiguous one.
 */
import { refundIdempotencyKey } from "@/lib/payments/cancellation";
import { stripeClient } from "@/lib/payments/stripe.server";

export interface RefundClaim {
  refundId: string;
  paymentId: string;
  bookingId: string;
  paymentIntentId: string | null;
  totalRefundPence: number;
  storageRefundPence: number;
  serviceFeeRefundPence: number;
  currency: string;
}

export interface RefundSubmission {
  submitted: boolean;
  stripeRefundId?: string;
  reason?: string;
}

/**
 * Sends a claimed refund to Stripe. Safe to call repeatedly for the same
 * refund row: Stripe returns the original object for a repeated idempotency
 * key, and an already-submitted row short-circuits.
 */
export async function submitRefundToStripe(claim: RefundClaim): Promise<RefundSubmission> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (claim.totalRefundPence <= 0) return { submitted: false, reason: "nothing_to_refund" };
  if (!claim.paymentIntentId) {
    await supabaseAdmin.rpc("fail_refund", {
      p_refund_id: claim.refundId,
      p_reason: "no stripe payment intent on the payment record",
    });
    return { submitted: false, reason: "no_payment_intent" };
  }

  const { data: existing } = await supabaseAdmin
    .from("booking_refunds")
    .select("stripe_refund_id, status")
    .eq("id", claim.refundId)
    .maybeSingle();
  if (existing?.stripe_refund_id) {
    return { submitted: true, stripeRefundId: existing.stripe_refund_id };
  }

  try {
    const stripe = stripeClient();
    const refund = await stripe.refunds.create(
      {
        payment_intent: claim.paymentIntentId,
        amount: claim.totalRefundPence,
        metadata: {
          refund_id: claim.refundId,
          booking_id: claim.bookingId,
          payment_id: claim.paymentId,
          storage_refund_pence: String(claim.storageRefundPence),
          service_fee_refund_pence: String(claim.serviceFeeRefundPence),
        },
      },
      { idempotencyKey: refundIdempotencyKey(claim.refundId) },
    );

    const chargeId = typeof refund.charge === "string" ? refund.charge : (refund.charge?.id ?? null);

    const { error } = await supabaseAdmin.rpc("mark_refund_submitted", {
      p_refund_id: claim.refundId,
      p_stripe_refund_id: refund.id,
      ...(chargeId ? { p_charge_id: chargeId } : {}),
    });
    if (error) throw new Error(error.message);

    return { submitted: true, stripeRefundId: refund.id };
  } catch (cause) {
    const message = (cause as Error).message ?? "refund failed";
    // Recoverable: the row stays pending and the same idempotency key is
    // reused on the next attempt, so Stripe cannot be charged twice.
    await supabaseAdmin.rpc("fail_refund", {
      p_refund_id: claim.refundId,
      p_reason: message.slice(0, 400),
    });
    console.error("Stripe refund failed", claim.refundId, message);
    return { submitted: false, reason: message };
  }
}
