/**
 * Privileged support-case operations (Prompt 18) — server only.
 *
 * Every function here is authorised TWICE: `requireSupabaseAuth` establishes
 * who is calling, and the underlying SECURITY DEFINER function re-checks
 * `is_support_staff(auth.uid())` in the database. A renter or host calling
 * these RPCs directly is refused by Postgres, not by this file.
 *
 * The financial path deliberately mirrors Prompt 13: the database records a
 * PENDING refund row inside one locked transaction, Stripe is contacted only
 * after that transaction commits, and the signed webhook stays the authority
 * for completion.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const caseId = z.string().uuid();

const statusInput = z.object({
  caseId,
  status: z.enum(["open", "waiting_for_other_party", "waiting_for_reporter", "under_review"]),
  message: z.string().trim().max(4000).optional(),
});

const resolutionInput = z.object({
  caseId,
  resolutionCode: z.enum([
    "no_action",
    "information_only",
    "agreement_reached",
    "booking_cancelled",
    "other",
  ]),
  resolutionSummary: z.string().trim().min(1).max(4000),
  internalNote: z.string().trim().max(4000).optional(),
});

const refundInput = z.object({
  caseId,
  paymentId: z.string().uuid(),
  amountPence: z.number().int().positive().max(100_000_00),
  resolutionSummary: z.string().trim().min(1).max(4000),
  internalNote: z.string().trim().max(4000).optional(),
});

/** Support-safe error text. Never leaks SQL or Stripe internals. */
const CASE_ERRORS: Record<string, string> = {
  not_support_staff: "You don't have permission to do that.",
  case_not_found: "That case could not be found.",
  case_already_resolved: "This case has already been resolved.",
  payment_not_found: "That payment could not be found.",
  payment_not_on_booking: "That payment does not belong to this booking.",
  payment_not_succeeded: "That payment did not succeed, so it cannot be refunded.",
  payment_fully_refunded: "That payment has already been fully refunded.",
  refund_exceeds_remaining: "The refund amount is higher than the remaining refundable amount.",
  refund_amount_invalid: "Enter a refund amount greater than zero.",
  resolution_summary_required: "Add a resolution summary before recording the outcome.",
  assignee_not_support_staff: "That person is not a support user.",
};

function friendly(message: string, fallback: string): string {
  for (const [key, text] of Object.entries(CASE_ERRORS)) {
    if (message.includes(key)) return text;
  }
  return fallback;
}

export const supportAssignCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ caseId, assignee: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("support_assign_case", {
      p_case_id: data.caseId,
      p_assignee: data.assignee,
    });
    if (error) throw new Error(friendly(error.message, "We couldn't assign that case."));
    return { assigned: true };
  });

export const supportAddNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ caseId, note: z.string().trim().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("support_add_note", {
      p_case_id: data.caseId,
      p_note: data.note,
    });
    if (error) throw new Error(friendly(error.message, "We couldn't save that note."));
    return { saved: true };
  });

export const supportPostUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ caseId, message: z.string().trim().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("support_post_update", {
      p_case_id: data.caseId,
      p_message: data.message,
    });
    if (error) throw new Error(friendly(error.message, "We couldn't post that update."));
    return { posted: true };
  });

export const supportSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("support_set_status", {
      p_case_id: data.caseId,
      p_status: data.status,
      ...(data.message ? { p_message: data.message } : {}),
    });
    if (error) throw new Error(friendly(error.message, "We couldn't update that case."));
    return { status: data.status };
  });

export const supportRecordResolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolutionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("support_record_resolution", {
      p_case_id: data.caseId,
      p_resolution_code: data.resolutionCode,
      p_resolution_summary: data.resolutionSummary,
      ...(data.internalNote ? { p_internal_note: data.internalNote } : {}),
      p_close: true,
    });
    if (error) throw new Error(friendly(error.message, "We couldn't record that resolution."));
    return { resolved: true };
  });

export interface SupportRefundResult {
  resolved: boolean;
  refundSubmitted: boolean;
  amountPence: number;
}

/**
 * Financial resolution. The amount the browser sends is a REQUEST — the
 * database re-derives the remaining refundable amount for the chosen payment
 * under a row lock and rejects anything larger, so an over-refund, a double
 * click or two support agents acting at once cannot produce a second refund.
 */
export const supportResolveWithRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refundInput.parse(data))
  .handler(async ({ data, context }): Promise<SupportRefundResult> => {
    const { data: raw, error } = await context.supabase.rpc("support_resolve_case_with_refund", {
      p_case_id: data.caseId,
      p_payment_id: data.paymentId,
      p_amount_pence: data.amountPence,
      p_resolution_summary: data.resolutionSummary,
      ...(data.internalNote ? { p_internal_note: data.internalNote } : {}),
    });
    if (error) throw new Error(friendly(error.message, "We couldn't record that refund."));

    const claim = (raw ?? {}) as Record<string, unknown>;
    const total = Number(claim["total_refund_pence"] ?? 0);
    if (total <= 0) return { resolved: true, refundSubmitted: false, amountPence: 0 };

    const { submitRefundToStripe } = await import("@/lib/payments/refund-processor.server");
    const submission = await submitRefundToStripe({
      refundId: String(claim["refund_id"] ?? ""),
      paymentId: String(claim["payment_id"] ?? ""),
      bookingId: String(claim["booking_id"] ?? ""),
      paymentIntentId:
        typeof claim["stripe_payment_intent_id"] === "string"
          ? claim["stripe_payment_intent_id"]
          : null,
      totalRefundPence: total,
      // Discretionary support refunds are recorded against the renter's total
      // payment. No storage/service-fee allocation is invented here.
      storageRefundPence: 0,
      serviceFeeRefundPence: 0,
      currency: String(claim["currency"] ?? "GBP"),
    });

    return { resolved: true, refundSubmitted: submission.submitted, amountPence: total };
  });
