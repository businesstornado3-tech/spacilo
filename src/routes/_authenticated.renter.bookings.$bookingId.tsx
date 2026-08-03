/**
 * Booking detail for the renter.
 *
 * A `pending_payment` booking is not paid and not confirmed: it shows the
 * first-month breakdown and a "Pay securely" action that starts a server-side
 * Stripe Checkout Session. A confirmed booking shows what was paid and, only
 * then, releases the host's exact address.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Lock, MapPin, ShieldCheck } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import { BookingSummary } from "@/components/bookings/BookingSummary";
import { PaymentBreakdown } from "@/components/payments/PaymentBreakdown";
import { CancellationPanel } from "@/components/payments/CancellationPanel";
import { useBooking } from "@/hooks/useBookings";
import { useAuth } from "@/hooks/useAuth";
import { useBookingCancellation, useBookingRefunds } from "@/hooks/useCancellation";
import { useBookingExactAddress, useBookingPayments, useStartCheckout } from "@/hooks/usePayments";
import { bookingFinancials, bookingStatusMeta } from "@/lib/bookings";
import { formatDate } from "@/lib/format";
import { track } from "@/lib/analytics";

const description = "Your booking details, taken from the request the host accepted.";

export const Route = createFileRoute("/_authenticated/renter/bookings/$bookingId")({
  // Optional parameter: `?checkout=cancelled` is set only by the Stripe cancel
  // URL, so every other link to this route may omit search entirely.
  validateSearch: (search: Record<string, unknown> = {}) => ({
    checkout: search["checkout"] === "cancelled" ? ("cancelled" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Booking — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Booking — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const { checkout } = Route.useSearch();
  const { user } = useAuth();
  const { data: booking, isLoading, error, refetch } = useBooking(bookingId);
  const { data: payments } = useBookingPayments(bookingId);
  const { data: cancellation } = useBookingCancellation(bookingId);
  const { data: refunds } = useBookingRefunds(bookingId);
  const startCheckout = useStartCheckout();

  const succeeded = (payments ?? []).find((p) => p.status === "succeeded") ?? null;
  const confirmed = booking?.status === "confirmed";
  const { data: address } = useBookingExactAddress(bookingId, confirmed && Boolean(succeeded));

  const finances = booking ? bookingFinancials(booking) : null;

  const onPay = async () => {
    if (!booking) return;
    try {
      const result = await startCheckout.mutateAsync(booking.id);
      track("checkout_started", { booking_id: booking.id });
      window.location.href = result.url;
    } catch (cause) {
      toast.error(
        "We couldn't start that payment",
        cause instanceof Error ? cause.message : "Please refresh and try again.",
      );
    }
  };

  return (
    <AppLayout
      mode="renter"
      title="Booking"
      description={description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/renter/bookings">All bookings</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && !booking ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h2 className="type-h3">Booking not found</h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            It may belong to another account.
          </p>
          <Button asChild className="mt-5">
            <Link to="/renter/bookings">Back to bookings</Link>
          </Button>
        </div>
      ) : null}

      {booking ? (
        <div className="max-w-2xl space-y-6">
          <p className="type-body-sm text-muted-foreground">
            {bookingStatusMeta(booking.status).detail}
          </p>

          {checkout === "cancelled" && booking.status === "pending_payment" ? (
            <section className="rounded-2xl border border-border bg-accent-soft p-5">
              <h2 className="type-h3">Payment not completed</h2>
              <p className="mt-1 type-body-sm text-muted-foreground">
                You left the payment page, so nothing was charged and this booking is still
                awaiting payment. You can try again below.
              </p>
            </section>
          ) : null}

          {booking.status === "pending_payment" && finances ? (
            <section className="space-y-4">
              <PaymentBreakdown amounts={finances} totalLabel="Total due now" />
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void onPay()}
                disabled={startCheckout.isPending}
              >
                <Lock className="size-4" aria-hidden="true" />
                {startCheckout.isPending ? "Opening secure payment…" : "Pay securely"}
              </Button>
              <p className="type-body-sm text-muted-foreground">
                Payment is handled by Stripe. {brand.name} never sees or stores your card details.
              </p>
            </section>
          ) : null}

          {confirmed && finances ? (
            <section className="space-y-4">
              <PaymentBreakdown amounts={finances} totalLabel="Total paid" showNotes={false} />
              {succeeded?.succeeded_at ? (
                <p className="type-body-sm text-muted-foreground">
                  Paid on {formatDate(succeeded.succeeded_at)}
                  {succeeded.stripe_payment_intent_id
                    ? ` · Reference ${succeeded.stripe_payment_intent_id}`
                    : ""}
                </p>
              ) : null}
              <p className="type-body-sm text-muted-foreground">
                Later months aren&apos;t charged yet. We&apos;ll tell you before anything else is
                collected.
              </p>
            </section>
          ) : null}

          {address ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="flex items-center gap-2 type-h3">
                <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                Storage address
              </h2>
              <p className="mt-1 type-body-sm text-muted-foreground">
                Released to you because this booking is confirmed and paid.
              </p>
              <address className="mt-3 flex items-start gap-2 not-italic type-body">
                <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  {[address.address_line1, address.address_line2, address.town, address.postcode]
                    .filter(Boolean)
                    .map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                </span>
              </address>
              {address.access_notes ? (
                <p className="mt-3 type-body-sm text-muted-foreground">{address.access_notes}</p>
              ) : null}
            </section>
          ) : null}

          <BookingSummary booking={booking} />

          <CancellationPanel
            booking={booking}
            payment={succeeded}
            cancellation={cancellation ?? null}
            refunds={refunds ?? []}
            viewerId={user?.id ?? null}
            audience="renter"
          />


          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link to="/renter/requests/$requestId" params={{ requestId: booking.request_id }}>
                View the original request
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/spaces/$spaceId" params={{ spaceId: booking.space_id }}>
                View the listing
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
