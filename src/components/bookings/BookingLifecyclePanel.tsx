/**
 * Booking lifecycle actions, shared by both sides of the marketplace.
 *
 * Every transition here is server-authoritative: the buttons call
 * `activate_booking` / `complete_booking`, which re-check ownership, payment,
 * dates and financial holds under a row lock. Nothing transitions on a page
 * load, a timer or a client-side date.
 */
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { brand } from "@/config/brand";
import { useStartExtensionCheckout } from "@/hooks/usePayments";
import {
  useActivateBooking,
  useBookingChangeRequests,
  useCompleteBooking,
  useRequestExtension,
  useRespondToExtension,
} from "@/hooks/useBookings";
import type { Booking } from "@/lib/bookings";
import {
  ACTIVATION_MESSAGE,
  COMPLETION_MESSAGE,
  activationGate,
  completionGate,
  lifecycleMeta,
  lifecycleState,
  type ActivationRejection,
  type CompletionRejection,
} from "@/lib/bookings-lifecycle";
import { formatDate, formatPrice } from "@/lib/format";
import { extensionRefund, type PaymentRow } from "@/lib/payments/history";
import { formatDuration } from "@/lib/pricing/duration";

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

export function BookingLifecyclePanel({
  booking,
  viewerId,
  paid,
  financiallyBlocked = false,
  audience,
  payments,
}: {
  booking: Booking;
  viewerId: string | null | undefined;
  paid: boolean;
  financiallyBlocked?: boolean;
  audience: "renter" | "host";
  /** Succeeded/attempted payments for this booking — used for refund wording. */
  payments?: PaymentRow[] | null;
}) {
  const state = lifecycleState(booking);
  const meta = lifecycleMeta(state);
  const activate = useActivateBooking();
  const complete = useCompleteBooking();

  const activation = activationGate({ booking, viewerId, paid, financiallyBlocked });
  const completion = completionGate({ booking, viewerId });

  const showActivate =
    (state === "ready_to_start" || state === "upcoming") && booking.status === "confirmed";
  const showComplete = booking.status === "active";

  const onActivate = async () => {
    try {
      await activate.mutateAsync(booking.id);
      toast.success("Storage started", "This booking is now in storage.");
    } catch (cause) {
      toast.error("We couldn't start this booking", errorMessage(cause, "Please try again."));
    }
  };

  const onComplete = async () => {
    try {
      await complete.mutateAsync(booking.id);
      toast.success("Booking finished", "This booking is now complete.");
    } catch (cause) {
      toast.error("We couldn't finish this booking", errorMessage(cause, "Please try again."));
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3">Storage period</h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            {formatDate(booking.start_date)} – {formatDate(booking.end_date)}
            {booking.duration_days_snapshot
              ? ` · ${formatDuration(booking.duration_days_snapshot)}`
              : ""}
          </p>
        </div>
        <Badge variant={meta.tone}>{meta.label}</Badge>
      </div>

      <p className="type-body-sm text-muted-foreground">
        {audience === "renter" ? meta.renterNote : meta.hostNote}
      </p>

      {booking.activated_at ? (
        <p className="type-body-sm text-muted-foreground">
          Storage confirmed as started on {formatDate(booking.activated_at)}.
        </p>
      ) : null}
      {booking.completed_at ? (
        <p className="type-body-sm text-muted-foreground">
          Completed on {formatDate(booking.completed_at)}.
        </p>
      ) : null}

      {showActivate ? (
        <div className="space-y-2">
          <Button
            onClick={() => void onActivate()}
            disabled={!activation.allowed || activate.isPending}
          >
            {activate.isPending ? "Confirming…" : "Confirm storage has started"}
          </Button>
          {!activation.allowed && activation.reason ? (
            <p className="type-body-sm text-muted-foreground">
              {ACTIVATION_MESSAGE[activation.reason as ActivationRejection]}
            </p>
          ) : null}
        </div>
      ) : null}

      {showComplete ? (
        <div className="space-y-2">
          <Button
            onClick={() => void onComplete()}
            disabled={!completion.allowed || complete.isPending}
          >
            {complete.isPending ? "Finishing…" : "Confirm collection and finish"}
          </Button>
          {!completion.allowed && completion.reason ? (
            <p className="type-body-sm text-muted-foreground">
              {COMPLETION_MESSAGE[completion.reason as CompletionRejection]}
            </p>
          ) : null}
        </div>
      ) : null}

      <ExtensionSection booking={booking} audience={audience} payments={payments ?? []} />
    </section>
  );
}

/* -------------------------------------------------------------- extensions */

const CHANGE_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting the host",
  accepted_awaiting_payment: "Accepted — payment to follow",
  applied: "Applied",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

function ExtensionSection({
  booking,
  audience,
  payments,
}: {
  booking: Booking;
  audience: "renter" | "host";
  payments: PaymentRow[];
}) {
  const { data: changes } = useBookingChangeRequests(booking.id);
  const request = useRequestExtension();
  const respond = useRespondToExtension();
  const startExtensionCheckout = useStartExtensionCheckout();
  const [newEndDate, setNewEndDate] = React.useState("");
  const [note, setNote] = React.useState("");

  const open = booking.status === "confirmed" || booking.status === "active";
  const rows = changes ?? [];
  const pending = rows.find((row) => row.status === "pending") ?? null;
  const awaitingPayment = rows.find((row) => row.status === "accepted_awaiting_payment") ?? null;
  // One extension at a time: no new request while one is open or unpaid.
  const blocked = Boolean(pending || awaitingPayment);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newEndDate) return;
    try {
      await request.mutateAsync({
        bookingId: booking.id,
        newEndDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNote("");
      toast.success("Extension requested", "The host will let you know.");
    } catch (cause) {
      toast.error("We couldn't request that extension", errorMessage(cause, "Please try again."));
    }
  };

  const onRespond = async (accept: boolean) => {
    if (!pending) return;
    try {
      await respond.mutateAsync({ changeId: pending.id, accept });
      toast.success(accept ? "Extension accepted" : "Extension declined");
    } catch (cause) {
      toast.error("We couldn't record that response", errorMessage(cause, "Please try again."));
    }
  };

  const onPayExtension = async () => {
    if (!awaitingPayment) return;
    try {
      const { url } = await startExtensionCheckout.mutateAsync(awaitingPayment.id);
      window.location.href = url;
    } catch (cause) {
      toast.error("We couldn't start that payment", errorMessage(cause, "Please try again."));
    }
  };

  if (!open && rows.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h3 className="type-h3">Extending this booking</h3>

      {rows.length > 0 ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl bg-muted/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-body-sm">
                  New end date {formatDate(row.proposed_end_date)}
                  {row.additional_days ? ` · ${formatDuration(row.additional_days)} more` : ""}
                </p>
                <Badge variant={row.status === "applied" || row.status === "accepted_awaiting_payment"
                    ? "success"
                    : "neutral"}>
                  {CHANGE_STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              </div>
              {row.additional_total_pence !== null ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  Extra storage {formatPrice(row.additional_storage_amount_pence ?? 0)} plus a{" "}
                  {formatPrice(row.additional_service_fee_pence ?? 0)} service fee ={" "}
                  {formatPrice(row.additional_total_pence)}.{" "}
                  {row.status === "applied"
                    ? appliedWording(payments, row.id)
                    : row.status === "accepted_awaiting_payment"
                      ? audience === "host"
                        ? "Renter payment pending."
                        : "Not charged yet."
                      : "Nothing is charged yet."}
                </p>
              ) : null}
              {row.renter_note ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  Renter&apos;s note: {row.renter_note}
                </p>
              ) : null}
              {row.host_response_note ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  Host&apos;s reply: {row.host_response_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {audience === "host" && open && pending ? (
        <div className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => void onRespond(true)} disabled={respond.isPending}>
            Accept extension
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onRespond(false)}
            disabled={respond.isPending}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {audience === "host" && open && awaitingPayment ? (
        <p className="type-body-sm text-muted-foreground">
          You&apos;ve accepted this extension. The storage period stays{" "}
          {formatDate(booking.start_date)} – {formatDate(booking.end_date)} until the renter pays.
        </p>
      ) : null}

      {audience === "renter" && open && awaitingPayment ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h4 className="type-h3">Extension accepted</h4>
            <p className="mt-1 type-body-sm text-muted-foreground">
              Your host has accepted your request to extend your storage until{" "}
              {formatDate(awaitingPayment.proposed_end_date)}.
            </p>
          </div>
          <dl className="space-y-1 type-body-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Extra storage</dt>
              <dd>{formatPrice(awaitingPayment.additional_storage_amount_pence ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{brand.name} service fee</dt>
              <dd>{formatPrice(awaitingPayment.additional_service_fee_pence ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-medium">
              <dt>Total to pay</dt>
              <dd>{formatPrice(awaitingPayment.additional_total_pence ?? 0)}</dd>
            </div>
          </dl>
          <Button
            onClick={() => void onPayExtension()}
            disabled={startExtensionCheckout.isPending}
          >
            {startExtensionCheckout.isPending
              ? "Opening secure checkout…"
              : `Pay ${formatPrice(awaitingPayment.additional_total_pence ?? 0)} securely`}
          </Button>
          <p className="type-body-sm text-muted-foreground">
            Your booking will be extended once payment is completed.
          </p>
        </div>
      ) : null}

      {audience === "renter" && open && !blocked ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            label="New end date"
            htmlFor="extend-end"
            hint="We'll price the extra days with the rates you already agreed."
          >
            <TextInput
              id="extend-end"
              type="date"
              value={newEndDate}
              min={booking.end_date}
              onChange={(event) => setNewEndDate(event.target.value)}
            />
          </Field>
          <Field label="Message to the host (optional)" htmlFor="extend-note">
            <TextArea
              id="extend-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={!newEndDate || request.isPending}>
            {request.isPending ? "Requesting…" : "Request an extension"}
          </Button>
          <p className="type-body-sm text-muted-foreground">
            Asking doesn&apos;t change your booking or take a payment. The host has to agree first.
          </p>
        </form>
      ) : null}

      {audience === "renter" && open && pending ? (
        <p className="type-body-sm text-muted-foreground">
          You can ask for another extension once this one is answered.
        </p>
      ) : null}

    </div>
  );
}

/**
 * An applied extension stays applied even if the booking is cancelled later —
 * but the money may since have come back, so say so.
 */
function appliedWording(payments: PaymentRow[], changeRequestId: string): string {
  const refund = extensionRefund(payments, changeRequestId);
  if (!refund) return "Paid.";
  return refund.fullyRefunded
    ? "Paid · subsequently refunded."
    : `Paid · ${formatPrice(refund.refundedTotalPence)} subsequently refunded.`;
}
