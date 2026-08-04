/**
 * Booking lifecycle actions, shared by both sides of the marketplace.
 *
 * Every transition here is server-authoritative: the buttons call
 * `confirm_booking_handover` / `confirm_booking_collection`, which re-check
 * ownership, payment, dates and financial holds under a row lock. Both the
 * renter AND the host must confirm before a booking moves on — one side alone
 * never changes the status. Nothing transitions on a page load or a timer.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { brand } from "@/config/brand";
import { useStartExtensionCheckout } from "@/hooks/usePayments";
import {
  useBookingChangeRequests,
  useConfirmCollection,
  useConfirmHandover,
  useRequestExtension,
  useRespondToExtension,
} from "@/hooks/useBookings";
import type { Booking } from "@/lib/bookings";
import {
  ACTIVATION_MESSAGE,
  COLLECTION_MESSAGE,
  collectionGate,
  handoverGate,
  handoverProgress,
  lifecycleMeta,
  lifecycleState,
  viewerConfirmed,
  type ActivationRejection,
  type CollectionRejection,
} from "@/lib/bookings-lifecycle";
import { HandoverEvidence } from "@/components/bookings/HandoverEvidence";
import { CONFIRMATION_STATEMENT, partyFor, visibleStages } from "@/lib/handover";
import { formatDate, formatPrice } from "@/lib/format";
import {
  bookingAcceptsExtensions,
  extensionHostEarningsPence,
  extensionStatusLabel,
  isExtensionConfirmed,
  openExtension,
} from "@/lib/extensions";
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
  const confirmHandover = useConfirmHandover();
  const confirmCollection = useConfirmCollection();

  const handover = handoverGate({ booking, viewerId, paid, financiallyBlocked });
  const collection = collectionGate({ booking, viewerId });

  const handoverSteps = handoverProgress(booking, "handover");
  const collectionSteps = handoverProgress(booking, "collection");
  const iConfirmedHandover = viewerConfirmed(booking, "handover", audience);
  const iConfirmedCollection = viewerConfirmed(booking, "collection", audience);

  const showHandover = booking.status === "confirmed";
  const showCollection = booking.status === "active";
  // Evidence is only writable by a participant; RLS re-checks this server-side.
  const party = partyFor(booking, viewerId);
  const stages = visibleStages(booking);
  const showRecord = booking.status === "completed";
  const otherParty = audience === "renter" ? "host" : "renter";

  const onConfirmHandover = async () => {
    try {
      const row = await confirmHandover.mutateAsync(booking.id);
      toast.success(
        row.status === "active" ? "Storage started" : "Handover confirmed",
        row.status === "active"
          ? "You've both confirmed, so this booking is now in storage."
          : `We've told the ${otherParty}. Storage starts once they confirm too.`,
      );
    } catch (cause) {
      toast.error("We couldn't confirm that", errorMessage(cause, "Please try again."));
    }
  };

  const onConfirmCollection = async () => {
    try {
      const row = await confirmCollection.mutateAsync(booking.id);
      toast.success(
        row.status === "completed" ? "Booking finished" : "Collection confirmed",
        row.status === "completed"
          ? "You've both confirmed, so this booking is complete."
          : `We've told the ${otherParty}. This booking finishes once they confirm too.`,
      );
    } catch (cause) {
      toast.error("We couldn't confirm that", errorMessage(cause, "Please try again."));
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

      <Button asChild variant="secondary" size="sm">
        <Link
          to={audience === "renter" ? "/renter/messages/$bookingId" : "/host/messages/$bookingId"}
          params={{ bookingId: booking.id }}
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          Message the {otherParty}
        </Link>
      </Button>

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

      {showHandover ? (
        <div className="space-y-2 rounded-xl bg-muted/60 p-4">
          <h3 className="type-body font-semibold">Starting storage</h3>
          <ConfirmationTicks
            renterConfirmed={handoverSteps.renterConfirmed}
            hostConfirmed={handoverSteps.hostConfirmed}
            renterLabel="Renter confirmed the belongings are in the space"
            hostLabel="Host confirmed the belongings are in the space"
          />
          {handoverSteps.awaitingOther ? (
            <p className="type-body-sm text-muted-foreground">
              Waiting for the {handoverSteps.renterConfirmed ? "host" : "renter"} to confirm the
              handover.
            </p>
          ) : null}
          {stages.includes("check_in") ? (
            <HandoverEvidence
              bookingId={booking.id}
              bookingStatus={booking.status}
              stage="check_in"
              role={party}
            />
          ) : null}
          {!iConfirmedHandover ? (
            <p className="type-body-sm">{CONFIRMATION_STATEMENT.check_in[audience]}</p>
          ) : null}
          {iConfirmedHandover ? (
            <p className="type-body-sm text-muted-foreground">
              You&apos;ve confirmed. Storage starts as soon as the {otherParty} confirms too.
            </p>
          ) : (
            <>
              <Button
                onClick={() => void onConfirmHandover()}
                disabled={!handover.allowed || confirmHandover.isPending}
              >
                {confirmHandover.isPending ? "Confirming…" : "Confirm storage has started"}
              </Button>
              {!handover.allowed && handover.reason ? (
                <p className="type-body-sm text-muted-foreground">
                  {ACTIVATION_MESSAGE[handover.reason as ActivationRejection]}
                </p>
              ) : (
                <p className="type-body-sm text-muted-foreground">
                  Both of you need to confirm before this booking shows as in storage.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {showCollection ? (
        <div className="space-y-2 rounded-xl bg-muted/60 p-4">
          <h3 className="type-body font-semibold">Ending storage</h3>
          <ConfirmationTicks
            renterConfirmed={collectionSteps.renterConfirmed}
            hostConfirmed={collectionSteps.hostConfirmed}
            renterLabel="Renter confirmed everything has been collected"
            hostLabel="Host confirmed the space is empty"
          />
          {collectionSteps.awaitingOther ? (
            <p className="type-body-sm text-muted-foreground">
              Waiting for the {collectionSteps.renterConfirmed ? "host" : "renter"} to confirm
              collection.
            </p>
          ) : null}
          <HandoverEvidence
            bookingId={booking.id}
            bookingStatus={booking.status}
            stage="check_out"
            role={party}
          />
          {!iConfirmedCollection ? (
            <p className="type-body-sm">{CONFIRMATION_STATEMENT.check_out[audience]}</p>
          ) : null}
          {iConfirmedCollection ? (
            <p className="type-body-sm text-muted-foreground">
              You&apos;ve confirmed. This booking finishes as soon as the {otherParty} confirms too.
            </p>
          ) : (
            <>
              <Button
                onClick={() => void onConfirmCollection()}
                disabled={!collection.allowed || confirmCollection.isPending}
              >
                {confirmCollection.isPending ? "Confirming…" : "Confirm collection"}
              </Button>
              {!collection.allowed && collection.reason ? (
                <p className="type-body-sm text-muted-foreground">
                  {COLLECTION_MESSAGE[collection.reason as CollectionRejection]}
                </p>
              ) : (
                <p className="type-body-sm text-muted-foreground">
                  Both of you need to confirm before this booking is marked complete.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {showRecord ? (
        <div className="space-y-4 rounded-xl bg-muted/60 p-4">
          <h3 className="type-body font-semibold">Handover record</h3>
          <div className="space-y-2">
            <p className="type-body-sm text-muted-foreground">
              Storage started{" "}
              {booking.activated_at ? formatDate(booking.activated_at) : "not recorded"}
            </p>
            <ConfirmationTicks
              renterConfirmed={handoverSteps.renterConfirmed}
              hostConfirmed={handoverSteps.hostConfirmed}
              renterLabel="Renter confirmed the handover"
              hostLabel="Host confirmed the handover"
            />
            <HandoverEvidence
              bookingId={booking.id}
              bookingStatus={booking.status}
              stage="check_in"
              role={party}
            />
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <p className="type-body-sm text-muted-foreground">
              Collection completed{" "}
              {booking.completed_at ? formatDate(booking.completed_at) : "not recorded"}
            </p>
            <ConfirmationTicks
              renterConfirmed={collectionSteps.renterConfirmed}
              hostConfirmed={collectionSteps.hostConfirmed}
              renterLabel="Renter confirmed collection"
              hostLabel="Host confirmed the space is clear"
            />
            <HandoverEvidence
              bookingId={booking.id}
              bookingStatus={booking.status}
              stage="check_out"
              role={party}
            />
          </div>
        </div>
      ) : null}

      <ExtensionSection booking={booking} audience={audience} payments={payments ?? []} />
    </section>
  );
}

/** Plain, symmetrical view of who has confirmed what. */
function ConfirmationTicks({
  renterConfirmed,
  hostConfirmed,
  renterLabel,
  hostLabel,
}: {
  renterConfirmed: boolean;
  hostConfirmed: boolean;
  renterLabel: string;
  hostLabel: string;
}) {
  const rows = [
    { done: renterConfirmed, label: renterLabel },
    { done: hostConfirmed, label: hostLabel },
  ];
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start gap-2 type-body-sm">
          <span aria-hidden="true" className={row.done ? "text-success" : "text-muted-foreground"}>
            {row.done ? "✓" : "○"}
          </span>
          <span className={row.done ? "" : "text-muted-foreground"}>
            {row.label}
            {row.done ? "" : " — not yet"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- extensions */

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

  const open = bookingAcceptsExtensions(booking.status);
  const rows = changes ?? [];
  const pending = rows.find((row) => row.status === "pending") ?? null;
  const awaitingPayment = rows.find((row) => row.status === "accepted_awaiting_payment") ?? null;
  // One extension at a time: no new request while one is open or unpaid.
  const blocked = Boolean(openExtension(rows));

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
                  {formatDate(row.original_end_date)} → {formatDate(row.proposed_end_date)}
                  {row.additional_days ? ` · ${formatDuration(row.additional_days)} more` : ""}
                </p>
                <Badge variant={isExtensionConfirmed(row) ? "success" : "neutral"}>
                  {extensionStatusLabel(row.status, audience)}
                </Badge>
              </div>
              {audience === "host" ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  Additional storage earnings{" "}
                  {formatPrice(extensionHostEarningsPence(row))}. The {brand.name} service fee is
                  paid by the renter on top and isn&apos;t taken from your earnings.{" "}
                  {row.status === "applied"
                    ? appliedWording(payments, row.id)
                    : row.status === "accepted_awaiting_payment"
                      ? "Waiting for the renter to pay."
                      : "Nothing is charged yet."}
                </p>
              ) : row.additional_total_pence !== null ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  Extra storage {formatPrice(row.additional_storage_amount_pence ?? 0)} plus a{" "}
                  {formatPrice(row.additional_service_fee_pence ?? 0)} service fee ={" "}
                  {formatPrice(row.additional_total_pence)}.{" "}
                  {row.status === "applied"
                    ? appliedWording(payments, row.id)
                    : row.status === "accepted_awaiting_payment"
                      ? "Not charged yet."
                      : "Nothing is charged yet."}
                </p>
              ) : null}
              <p className="mt-1 type-body-sm text-muted-foreground">
                Requested {formatDate(row.created_at)}
                {row.responded_at ? ` · answered ${formatDate(row.responded_at)}` : ""}
                {row.status === "applied" ? ` · confirmed ${formatDate(row.updated_at)}` : ""}
              </p>
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
