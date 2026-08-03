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
import { bookingKeys, changeRequestKeys, useBooking } from "@/hooks/useBookings";
import { useBookingPayments } from "@/hooks/usePayments";
import { formatDate, formatPrice } from "@/lib/format";

const description = "We're confirming your payment with our payment provider.";

export const Route = createFileRoute("/_authenticated/renter/payments/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    bookingId: typeof search["bookingId"] === "string" ? search["bookingId"] : "",
    extensionId: typeof search["extensionId"] === "string" ? search["extensionId"] : undefined,
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
  const { bookingId, extensionId } = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: booking } = useBooking(bookingId || undefined);
  const { data: payments } = useBookingPayments(bookingId || undefined, true);

  // An extension is confirmed by its own payment row, verified by the webhook.
  const extensionPayment = extensionId
    ? (payments ?? []).find((p) => p.change_request_id === extensionId)
    : undefined;
  const extensionPaid = extensionPayment?.status === "succeeded";
  const confirmed = extensionId ? extensionPaid : booking?.status === "confirmed";
  const failed = extensionId
    ? extensionPayment?.status === "failed" || extensionPayment?.status === "expired"
    : (payments ?? []).some((p) => p.status === "failed" || p.status === "expired");

  // Keep the booking query in step with the polled payment rows.
  useEffect(() => {
    if (!bookingId) return;
    const timer = window.setInterval(() => {
      if (confirmed) return;
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
      void queryClient.invalidateQueries({ queryKey: changeRequestKeys.forBooking(bookingId) });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [bookingId, confirmed, queryClient]);

  return (
    <AppLayout
      mode="renter"
      title={
        confirmed
          ? extensionId
            ? "Extension confirmed"
            : "Booking confirmed"
          : "Confirming your payment…"
      }
    >
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
              {extensionId ? "Extension confirmed" : "Booking confirmed"}
            </h2>
            {extensionId && booking ? (
              <div className="space-y-2 type-body-sm text-muted-foreground">
                <p>
                  Your storage booking has been extended to {formatDate(booking.end_date)}.
                </p>
                <p>
                  Extension payment: storage{" "}
                  {formatPrice(extensionPayment?.storage_amount_pence ?? 0)}, {brand.name} service
                  fee {formatPrice(extensionPayment?.service_fee_amount_pence ?? 0)}, total paid{" "}
                  {formatPrice(extensionPayment?.renter_total_amount_pence ?? 0)}.
                </p>
              </div>
            ) : (
              <p className="type-body-sm text-muted-foreground">
                Your storage period has been paid for and the host has been notified.
              </p>
            )}
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
              {extensionId
                ? "Nothing was charged and your booking dates are unchanged. Your extension is still awaiting payment and you can try again."
                : "Nothing was charged. Your booking is still awaiting payment and you can try again."}
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
