/**
 * Cancellation & refund UI for a booking (Prompts 13 & 17).
 *
 * Both parties see the SAME financial facts. This component never calculates
 * a refund: before cancellation it renders the server's authoritative quote
 * (`get_booking_cancellation_quote`), and afterwards it renders only what the
 * database recorded. The quote shown here is informational — `cancel_booking`
 * recomputes it under a row lock when the user confirms, so a booking that
 * became active in the meantime follows the early-termination path instead.
 */
import * as React from "react";
import { AlertTriangle, Ban, Loader2, RotateCcw } from "lucide-react";

import { brand } from "@/config/brand";
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
} from "@/lib/payments/cancellation";
import {
  REASON_DETAIL_MAX,
  cancellationReasonLabel,
  cancellationReasons,
} from "@/lib/payments/cancellation-reasons";
import { includesExtension } from "@/lib/payments/quote";
import type { BookingCancellationRow, BookingRefundRow } from "@/lib/cancellations-api";
import { settledRefundTotals } from "@/lib/cancellations-api";
import { useCancelBooking, useCancellationQuote } from "@/hooks/useCancellation";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  booking: Tables<"bookings">;
  cancellation: BookingCancellationRow | null;
  refunds: BookingRefundRow[];
  viewerId: string | null;
  audience: "renter" | "host";
}

export function CancellationPanel({
  booking,
  cancellation,
  refunds,
  viewerId,
  audience,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState("");
  const [details, setDetails] = React.useState("");
  const cancel = useCancelBooking(booking.id);

  const isParty = viewerId === booking.renter_id || viewerId === booking.host_id;
  const { data: quote, isLoading: quoteLoading } = useCancellationQuote(
    booking.id,
    isParty && !cancellation,
  );

  const settled = settledRefundTotals(refunds);
  const reasons = cancellationReasons(audience);

  const onConfirm = async () => {
    try {
      const result = await cancel.mutateAsync({
        ...(details.trim() ? { reason: details.trim() } : {}),
        ...(category ? { reasonCategory: category } : {}),
      });
      setOpen(false);
      setDetails("");
      setCategory("");
      toast.success(
        "Booking cancelled",
        result.totalRefundPence > 0
          ? `A refund of ${formatPrice(result.totalRefundPence)} is on its way.`
          : result.resolution === "review_required"
            ? "Storage had already started, so we'll review this and be in touch."
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
    const byViewer = cancellation.requested_by_role === audience;
    const reasonLabel = cancellationReasonLabel(cancellation.category);
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 type-h3">
          <Ban className="size-4 text-muted-foreground" aria-hidden="true" />
          {RESOLUTION_LABEL[cancellation.financial_resolution_state]}
        </h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {byViewer
            ? "Cancelled by you"
            : `Cancelled by the ${cancellation.requested_by_role}`}{" "}
          on {formatDate(cancellation.created_at)}.
        </p>

        {reasonLabel ? (
          <p className="mt-3 type-body-sm">
            <span className="text-muted-foreground">Reason: </span>
            {reasonLabel}
          </p>
        ) : null}

        {cancellation.reason?.trim() ? (
          <p className="mt-1 type-body-sm">
            <span className="text-muted-foreground">Details: </span>
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

        {refunds.some((r) => r.status === "failed") ? (
          <Alert className="mt-3" tone="warning" title="Refund needs attention">
            We couldn&apos;t complete the refund automatically. The payment record has been kept
            for support review — there&apos;s nothing you need to do again.
          </Alert>
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

  if (!isParty) return null;
  if (quoteLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="type-body-sm text-muted-foreground">Checking your cancellation options…</p>
      </section>
    );
  }
  // Completed and already-cancelled bookings offer nothing here; active
  // bookings are handled by the early-termination panel instead.
  if (!quote || !quote.allowed || quote.category !== "pre_start") return null;

  const total = quote.totalRefundPence;
  const paidAnything = quote.storagePaidPence + quote.serviceFeePaidPence > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="type-h3">
        {audience === "host" ? "Need to cancel this booking?" : "Need to cancel?"}
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        {!paidAnything
          ? "Nothing has been charged for this booking, so cancelling costs nothing and the dates are released."
          : audience === "host"
            ? `If you cancel, the renter will receive a full refund of ${formatPrice(total)} and these dates will become available again.`
            : `Cancelling before your storage starts refunds the full ${formatPrice(total)} you paid, including the ${brand.name} service fee.`}
      </p>

      <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
        Cancel this booking
      </Button>

      <Modal open={open} onOpenChange={setOpen} title="Cancel this booking?">
        <div className="space-y-4">
          {paidAnything ? (
            <dl className="space-y-2 rounded-xl bg-muted/60 p-4 type-body-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Storage</dt>
                <dd className="font-medium">{formatPrice(quote.refundableStoragePence)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{brand.name} service fee</dt>
                <dd className="font-medium">{formatPrice(quote.refundableServiceFeePence)}</dd>
              </div>
              {includesExtension(quote) ? (
                <p className="type-body-sm text-muted-foreground">
                  This includes the extension you paid for.
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
                <dt className="font-medium">
                  {audience === "host" ? "Renter refund" : "Total refund"}
                </dt>
                <dd className="font-semibold">{formatPrice(total)}</dd>
              </div>
              {audience === "host" ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Your storage earnings</dt>
                  <dd className="font-medium">
                    {formatPrice(quote.hostEarningsPence)} → {formatPrice(0)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="type-body-sm text-muted-foreground">
              This booking hasn&apos;t been paid, so nothing will be refunded.
            </p>
          )}

          <p className="type-body-sm text-muted-foreground">
            The booking will be cancelled and these dates will become available again.
          </p>

          <label className="block type-body-sm">
            <span className="font-medium">Reason for cancellation</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
            >
              <option value="">Choose a reason</option>
              {reasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block type-body-sm">
            <span className="font-medium">Optional details</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={REASON_DETAIL_MAX}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
              placeholder="Anything the other person should know"
            />
          </label>

          <Alert tone="warning" title="This can't be undone">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Cancelling releases the space and ends access to the storage address.
            </span>
          </Alert>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={cancel.isPending}>
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => void onConfirm()}
              disabled={cancel.isPending || !category}
            >
              {cancel.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {cancel.isPending
                ? "Cancelling…"
                : total > 0
                  ? `Cancel booking and refund ${formatPrice(total)}`
                  : "Cancel booking"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
