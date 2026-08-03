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

    const refundId = typeof result["refund_id"] === "string" ? result["refund_id"] : null;
    let refundSubmitted = false;

    if (refundId && num("total_refund_pence") > 0) {
      const { submitRefundToStripe } = await import("@/lib/payments/refund-processor.server");
      const submission = await submitRefundToStripe({
        refundId,
        paymentId: String(result["payment_id"] ?? ""),
        bookingId: data.bookingId,
        paymentIntentId:
          typeof result["stripe_payment_intent_id"] === "string"
            ? result["stripe_payment_intent_id"]
            : null,
        totalRefundPence: num("total_refund_pence"),
        storageRefundPence: num("storage_refund_pence"),
        serviceFeeRefundPence: num("service_fee_refund_pence"),
        currency: String(result["currency"] ?? "GBP"),
      });
      refundSubmitted = submission.submitted;
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
