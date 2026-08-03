/**
 * Booking detail for the renter. Rendered entirely from the booking snapshot.
 * A `pending_payment` booking is not paid, not confirmed and doesn't release
 * the host's exact address.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { BookingSummary } from "@/components/bookings/BookingSummary";
import { useBooking } from "@/hooks/useBookings";
import { bookingStatusMeta } from "@/lib/bookings";

const description = "Your booking details, taken from the request the host accepted.";

export const Route = createFileRoute("/_authenticated/renter/bookings/$bookingId")({
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
  const { data: booking, isLoading, error, refetch } = useBooking(bookingId);

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

          <BookingSummary booking={booking} />

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
