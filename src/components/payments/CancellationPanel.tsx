/**
 * Cancellation & refund UI for a booking (Prompt 13).
 *
 * Both parties see the SAME financial facts, taken from server-owned rows.
 * This component never calculates a refund amount: pre-start it previews the
 * policy outcome from the payment snapshot, and once a cancellation exists it
 * renders only what the database recorded.
 */
import * as React from "react";
import { AlertTriangle, Ban, Loader2, RotateCcw } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { toast } from "@/components/overlay/toast";
import { formatDate, formatPrice } from "@/lib/format";
import {
  POST_START_REVIEW_COPY,
  REFUND_PROCESSING_COPY,
  REFUND_STATUS_LABEL,
  RESOLUTION_LABEL,
  cancellationDecision,
  cancellationEligibility,
  storageHasStarted,
  type CancellationSubject,
} from "@/lib/payments/cancellation";
import type { BookingCancellationRow, BookingRefundRow } from "@/lib/cancellations-api";
import { settledRefundTotals } from "@/lib/cancellations-api";
import { useCancelBooking } from "@/hooks/useCancellation";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  booking: Tables<"bookings">;
  payment: Tables<"payments"> | null;
  cancellation: BookingCancellationRow | null;
  refunds: BookingRefundRow[];
  viewerId: string | null;
  audience: "renter" | "host";
}

export function CancellationPanel({
  booking,
  payment,
  cancellation,
  refunds,
  viewerId,
  audience,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const cancel = useCancelBooking(booking.id);

  const eligibility = cancellationEligibility(booking, viewerId);
  const started = storageHasStarted(booking.start_date);

  const subject: CancellationSubject = {
    status: booking.status,
    startDate: booking.start_date,
    paid: payment
      ? {
          storageAmountPence: payment.storage_amount_pence,
          serviceFeeAmountPence: payment.service_fee_amount_pence,
          refundedStoragePence: payment.refunded_storage_pence ?? 0,
          refundedServiceFeePence: payment.refunded_service_fee_pence ?? 0,
        }
      : null,
  };
  const preview = cancellationDecision(subject);
  const settled = settledRefundTotals(refunds);

  const onConfirm = async () => {
    try {
      const result = await cancel.mutateAsync(reason.trim() || undefined);
      setOpen(false);
      setReason("");
      toast.success(
        "Booking cancelled",
        result.totalRefundPence > 0
          ? `A refund of ${formatPrice(result.totalRefundPence)} is on its way.`
          : result.resolution === "review_required"
            ? "We'll review this cancellation and be in touch."
            : "Nothing was charged for this booking.",
      );
    } catch (cause) {
      toast.error(
        "We couldn't cancel that booking",
        cause instanceof Error ? cause.message : "Please refresh and try again.",
      );
    }
  };

  /* ------------------------------------------------ already cancelled */

  if (cancellation) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 type-h3">
          <Ban className="size-4 text-muted-foreground" aria-hidden="true" />
          {RESOLUTION_LABEL[cancellation.financial_resolution_state]}
        </h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Cancelled on {formatDate(cancellation.created_at)} by{" "}
          {cancellation.requested_by_role === audience
            ? "you"
            : `the ${cancellation.requested_by_role}`}
          .
        </p>

        {cancellation.reason?.trim() ? (
          <p className="mt-3 type-body-sm">
            <span className="text-muted-foreground">Reason given: </span>
            {cancellation.reason.trim()}
          </p>
        ) : null}

        {cancellation.financial_resolution_state === "review_required" ? (
          <Alert className="mt-4" tone="warning" title="Under review">
            {POST_START_REVIEW_COPY}
          </Alert>
        ) : null}


        {refunds.length > 0 ? (
          <dl className="mt-4 space-y-2 type-body-sm">
            {refunds.map((refund) => (
              <div key={refund.id} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">
                  {REFUND_STATUS_LABEL[refund.status]} · {formatDate(refund.created_at)}
                </dt>
                <dd className="font-medium">{formatPrice(refund.total_refund_pence)}</dd>
              </div>
            ))}
            {settled.totalPence > 0 ? (
              <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
                <dt className="text-muted-foreground">Refunded so far</dt>
                <dd className="font-semibold">{formatPrice(settled.totalPence)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {refunds.some((r) => r.status === "pending") ? (
          <p className="mt-3 flex items-start gap-2 type-body-sm text-muted-foreground">
            <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {REFUND_PROCESSING_COPY}
          </p>
        ) : null}

        {audience === "host" ? (
          <p className="mt-3 type-body-sm text-muted-foreground">
            Any earnings for this booking are adjusted automatically. You are never asked to send
            money back.
          </p>
        ) : null}
      </section>
    );
  }

  /* --------------------------------------------------- cancel available */

  if (!eligibility.allowed) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="type-h3">Need to cancel?</h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        {!payment
          ? "Nothing has been charged for this booking, so cancelling costs nothing."
          : started
            ? POST_START_REVIEW_COPY
            : `Cancelling before your storage starts refunds the full ${formatPrice(
                preview.refund.totalRefundPence,
              )} you paid, including the ${"service fee"}.`}
      </p>

      <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
        Cancel this booking
      </Button>

      <Modal open={open} onOpenChange={setOpen} title="Cancel this booking?">
        <div className="space-y-4">
          <p className="type-body-sm text-muted-foreground">
            {!payment
              ? "This booking hasn't been paid, so nothing will be refunded and the space is released."
              : started
                ? POST_START_REVIEW_COPY
                : `We'll refund ${formatPrice(preview.refund.totalRefundPence)} to the card you paid with. This can't be undone.`}
          </p>

          <label className="block type-body-sm">
            <span className="font-medium">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
              placeholder="Tell us briefly why you're cancelling"
            />
          </label>

          <Alert tone="warning" title="This is final">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Cancelling releases the space and ends access to the storage address.
            </span>
          </Alert>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={cancel.isPending}>
              Keep booking
            </Button>
            <Button variant="destructive" onClick={() => void onConfirm()} disabled={cancel.isPending}>
              {cancel.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {cancel.isPending ? "Cancelling…" : "Yes, cancel booking"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
