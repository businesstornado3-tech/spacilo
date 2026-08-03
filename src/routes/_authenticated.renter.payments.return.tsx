/**
 * Stripe return page.
 *
 * Reaching this URL proves nothing — Stripe redirects the browser before, and
 * sometimes long before, the webhook lands. So we show "Confirming your
 * payment…" and poll the authoritative booking state until the verified
 * webhook has confirmed it. We never claim success from the redirect alone.
 */
import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { bookingKeys, useBooking } from "@/hooks/useBookings";
import { useBookingPayments } from "@/hooks/usePayments";

const description = "We're confirming your payment with our payment provider.";

export const Route = createFileRoute("/_authenticated/renter/payments/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    bookingId: typeof search["bookingId"] === "string" ? search["bookingId"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirming your payment — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Confirming your payment — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentReturnPage,
});

function PaymentReturnPage() {
  const { bookingId } = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: booking } = useBooking(bookingId || undefined);
  const { data: payments } = useBookingPayments(bookingId || undefined, true);

  const confirmed = booking?.status === "confirmed";
  const failed = (payments ?? []).some((p) => p.status === "failed" || p.status === "expired");

  // Keep the booking query in step with the polled payment rows.
  useEffect(() => {
    if (!bookingId) return;
    const timer = window.setInterval(() => {
      if (!confirmed) void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [bookingId, confirmed, queryClient]);

  return (
    <AppLayout mode="renter" title={confirmed ? "Booking confirmed" : "Confirming your payment…"}>
      <div className="max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        {!bookingId ? (
          <>
            <h2 className="type-h3">We couldn&apos;t identify that booking</h2>
            <Button asChild>
              <Link to="/renter/bookings">Go to my bookings</Link>
            </Button>
          </>
        ) : confirmed ? (
          <>
            <h2 className="flex items-center gap-2 type-h3">
              <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
              Booking confirmed
            </h2>
            <p className="type-body-sm text-muted-foreground">
              Your first month has been paid and the host has been notified.
            </p>
            <Button asChild>
              <Link to="/renter/bookings/$bookingId" params={{ bookingId }}>
                View booking
              </Link>
            </Button>
          </>
        ) : failed ? (
          <>
            <h2 className="type-h3">That payment didn&apos;t go through</h2>
            <p className="type-body-sm text-muted-foreground">
              Nothing was charged. Your booking is still awaiting payment and you can try again.
            </p>
            <Button asChild>
              <Link to="/renter/bookings/$bookingId" params={{ bookingId }}>
                Back to booking
              </Link>
            </Button>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-2 type-h3">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
              Confirming your payment…
            </h2>
            <p className="type-body-sm text-muted-foreground">
              We&apos;re waiting for confirmation from our payment provider. This usually takes a
              few seconds. It&apos;s safe to leave this page — your booking will update on its own.
            </p>
            <Button asChild variant="secondary">
              <Link to="/renter/bookings/$bookingId" params={{ bookingId }}>
                Go to booking
              </Link>
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
