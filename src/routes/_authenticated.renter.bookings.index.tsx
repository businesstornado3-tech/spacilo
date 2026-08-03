/**
 * Renter bookings. A booking exists only after the host accepted a request and
 * the renter continued; until payment is built, every booking sits in
 * "Awaiting payment".
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "@/components/bookings/BookingSummary";
import { useMyBookings } from "@/hooks/useBookings";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { bookingView, type Booking } from "@/lib/bookings";

const description = "Bookings you've started from accepted storage requests.";

export const Route = createFileRoute("/_authenticated/renter/bookings/")({
  head: () => ({
    meta: [
      { title: "Bookings — Renting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Bookings — Renting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RenterBookingsPage,
});

function RenterBookingsPage() {
  const { data, isLoading, error, refetch } = useMyBookings();
  const bookings = data ?? [];
  const awaiting = bookings.filter((b) => b.status === "pending_payment");
  const cancelled = bookings.filter((b) => b.status === "cancelled");
  const other = bookings.filter(
    (b) => b.status !== "pending_payment" && b.status !== "cancelled",
  );

  return (
    <AppLayout mode="renter" title="Bookings" description={description}>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No bookings yet"
          description="When a host accepts one of your requests, you can continue to booking from there."
        />
      ) : null}

      {bookings.length > 0 ? (
        <div className="space-y-8">
          <BookingGroup title="Awaiting payment" bookings={awaiting} />
          <BookingGroup title="Other bookings" bookings={other} />
          <BookingGroup title="Cancelled bookings" bookings={cancelled} />
        </div>
      ) : null}
    </AppLayout>
  );
}

function BookingGroup({ title, bookings }: { title: string; bookings: Booking[] }) {
  if (bookings.length === 0) return null;
  return (
    <section>
      <h2 className="type-h3">{title}</h2>
      <ul className="mt-3 space-y-3">
        {bookings.map((booking) => {
          const view = bookingView(booking);
          return (
            <li key={booking.id}>
              <article className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="type-h3 truncate">{view.spaceTitle}</h3>
                    <p className="type-body-sm text-muted-foreground">
                      {spaceTypeLabel(view.spaceType as SpaceTypeValue)}
                      {view.area ? ` · ${view.area}` : ""}
                    </p>
                  </div>
                  <BookingStatusBadge booking={booking} />
                </div>

                <p className="mt-3 type-body-sm">{view.period}</p>
                <p className="type-body-sm text-muted-foreground">
                  {view.priceLabel} · {view.itemCount} items · {view.requirementM3.toFixed(2)} m³
                </p>

                <Button asChild variant="secondary" size="sm" className="mt-4">
                  <Link to="/renter/bookings/$bookingId" params={{ bookingId: booking.id }}>
                    View booking
                  </Link>
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
