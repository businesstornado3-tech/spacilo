/**
 * Booking cancellation (Prompt 13).
 *
 * The browser sends only a booking id and an optional free-text reason. It
 * never sends amounts, ownership, eligibility, Stripe identifiers or payout
 * state — all of that is resolved server-side from the amounts snapshotted at
 * payment time.
 *
 * `cancel_booking` runs as the signed-in user inside one transaction and is
 * idempotent: a second call returns the first outcome instead of creating a
 * second refund. Stripe is only contacted after that transaction commits.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export interface CancelBookingResult {
  outcome: string;
  resolution: string;
  policyVersion: string;
  storageRefundPence: number;
  serviceFeeRefundPence: number;
  totalRefundPence: number;
  refundSubmitted: boolean;
}

export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<CancelBookingResult> => {
    const { supabase } = context;

    const { data: raw, error } = await supabase.rpc("cancel_booking", {
      p_booking_id: data.bookingId,
      ...(data.reason ? { p_reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);

    const result = (raw ?? {}) as Record<string, unknown>;
    const num = (key: string) => Number(result[key] ?? 0);

    // A booking can have SEVERAL succeeded payments (the original booking plus
    // each paid extension). Every one of them gets its own refund row and its
    // own Stripe refund, keyed by that row's id.
    const claims = Array.isArray(result["refunds"])
      ? (result["refunds"] as Record<string, unknown>[])
      : [];

    let refundSubmitted = claims.length > 0;

    if (claims.length > 0) {
      const { submitRefundToStripe } = await import("@/lib/payments/refund-processor.server");
      for (const claim of claims) {
        const total = Number(claim["total_refund_pence"] ?? 0);
        if (total <= 0) continue;
        const submission = await submitRefundToStripe({
          refundId: String(claim["refund_id"] ?? ""),
          paymentId: String(claim["payment_id"] ?? ""),
          bookingId: data.bookingId,
          paymentIntentId:
            typeof claim["stripe_payment_intent_id"] === "string"
              ? claim["stripe_payment_intent_id"]
              : null,
          totalRefundPence: total,
          storageRefundPence: Number(claim["storage_refund_pence"] ?? 0),
          serviceFeeRefundPence: Number(claim["service_fee_refund_pence"] ?? 0),
          currency: String(claim["currency"] ?? "GBP"),
        });
        if (!submission.submitted) refundSubmitted = false;
      }
    }

    return {
      outcome: String(result["outcome"] ?? "unknown"),
      resolution: String(result["resolution"] ?? "not_required"),
      policyVersion: String(result["policy_version"] ?? ""),
      storageRefundPence: num("storage_refund_pence"),
      serviceFeeRefundPence: num("service_fee_refund_pence"),
      totalRefundPence: num("total_refund_pence"),
      refundSubmitted,
    };
  });

