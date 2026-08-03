/**
 * Final booking review. Everything shown comes from the accepted request's
 * immutable snapshot — not the live listing — and continuing creates a
 * booking in "awaiting payment". No payment is taken here.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import { RequestSummary } from "@/components/requests/RequestSummary";
import { useRequest } from "@/hooks/useStorageRequests";
import { useBookingForRequest, useCreateBooking } from "@/hooks/useBookings";
import {
  BOOKING_PAYMENT_NOTE,
  ACCEPTED_EXPIRED_COPY,
  bookingActionState,
  bookingWindowLabel,
} from "@/lib/bookings";
import { track } from "@/lib/analytics";

const description =
  "Check the space, dates, price and belongings captured when the host accepted your request.";

export const Route = createFileRoute("/_authenticated/renter/requests/$requestId/booking")({
  head: () => ({
    meta: [
      { title: "Review your booking — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Review your booking — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingReviewPage,
});

function BookingReviewPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const { data: request, isLoading, error, refetch } = useRequest(requestId);
  const { data: existing, isLoading: bookingLoading } = useBookingForRequest(requestId);
  const create = useCreateBooking();

  const state = request ? bookingActionState(request, existing) : { kind: "none" as const };

  const onContinue = async () => {
    if (!request) return;
    try {
      const booking = await create.mutateAsync(request.id);
      track("booking_created", { request_id: request.id, status: booking.status });
      toast.success("Booking started", "It stays awaiting payment for now.");
      void navigate({ to: "/renter/bookings/$bookingId", params: { bookingId: booking.id } });
    } catch {
      toast.error("We couldn't start that booking", "Please refresh and try again.");
    }
  };

  return (
    <AppLayout
      mode="renter"
      title="Review your booking"
      description={description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/renter/requests/$requestId" params={{ requestId }}>
            Back to request
          </Link>
        </Button>
      }
    >
      {isLoading || bookingLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && !request ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h2 className="type-h3">Request not found</h2>
          <Button asChild className="mt-5">
            <Link to="/renter/requests">Back to my requests</Link>
          </Button>
        </div>
      ) : null}

      {request && !bookingLoading ? (
        <div className="max-w-2xl space-y-6">
          <section className="rounded-2xl border border-border bg-accent-soft p-5">
            <h2 className="type-h3">The host accepted your request</h2>
            <p className="mt-1 type-body-sm text-muted-foreground">
              These are the details the host accepted. They don't change if the listing is edited
              later.
            </p>
          </section>

          <RequestSummary request={request} />

          {state.kind === "started" ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">Booking started</h2>
              <p className="mt-1 type-body-sm text-muted-foreground">
                You've already started a booking from this request.
              </p>
              <Button asChild className="mt-4">
                <Link to="/renter/bookings/$bookingId" params={{ bookingId: state.bookingId }}>
                  View booking
                </Link>
              </Button>
            </section>
          ) : null}

          {state.kind === "expired" ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">This acceptance has expired</h2>
              <p className="mt-1 type-body-sm text-muted-foreground">{ACCEPTED_EXPIRED_COPY}</p>
            </section>
          ) : null}

          {state.kind === "continue" ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">Ready to continue?</h2>
              <p className="mt-1 type-body-sm text-muted-foreground">{BOOKING_PAYMENT_NOTE}</p>
              {bookingWindowLabel(request) ? (
                <p className="mt-1 type-body-sm text-muted-foreground">
                  {bookingWindowLabel(request)}
                </p>
              ) : null}
              <Button className="mt-4" onClick={() => void onContinue()} disabled={create.isPending}>
                {create.isPending ? "Starting…" : "Create booking"}
              </Button>
            </section>
          ) : null}
        </div>
      ) : null}
    </AppLayout>
  );
}
