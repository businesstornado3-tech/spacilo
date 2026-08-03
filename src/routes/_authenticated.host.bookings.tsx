/**
 * Host bookings — at this stage, the incoming storage request inbox.
 * Every figure comes from each request's immutable snapshot.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestStatusBadge } from "@/components/requests/RequestSummary";
import { useHostRequests } from "@/hooks/useStorageRequests";
import { useMyBookings } from "@/hooks/useBookings";
import { useMyBookingCancellations } from "@/hooks/useCancellation";
import { useHostEarnings } from "@/hooks/useHostPayouts";
import { cumulativeHostStoragePence, earningsByBooking } from "@/lib/payments/history";
import { useAuth } from "@/hooks/useAuth";
import { BookingLifecyclePanel } from "@/components/bookings/BookingLifecyclePanel";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  groupBookings,
  lifecycleMeta,
  lifecycleState,
  type LifecycleGroup,
} from "@/lib/bookings-lifecycle";
import type { BookingCancellationRow } from "@/lib/cancellations-api";
import {
  bookingView,
  bookingsByRequest,
  formatBookingDuration,
  hostBookingDetail,
  hostEarningsLabel,
  type Booking,
} from "@/lib/bookings";
import { formatPrice } from "@/lib/format";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import {
  REQUEST_LIST_DISCLAIMER,
  effectiveStatus,
  expiryLabel,
  requestSnapshotView,
  type StorageRequest,
} from "@/lib/storage-requests";

export const Route = createFileRoute("/_authenticated/host/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Hosting — " + brand.name },
      { name: "description", content: "Review incoming storage requests for your spaces and respond to renters." },
      { property: "og:title", content: "Bookings — Hosting — " + brand.name },
      { property: "og:description", content: "Review incoming storage requests for your spaces and respond to renters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostBookingsPage,
});

function HostBookingsPage() {
  const { data, isLoading, error, refetch } = useHostRequests();
  const { data: bookingsData } = useMyBookings();
  const { data: cancellationRows } = useMyBookingCancellations();
  const { data: earningRows } = useHostEarnings();
  // Cumulative storage earnings come from the earnings ledger — one row per
  // successful payment, original and each paid extension alike.
  const earnings = earningsByBooking(earningRows);
  const { user } = useAuth();
  const cancellations = new Map((cancellationRows ?? []).map((c) => [c.booking_id, c]));
  const bookings = bookingsData ?? [];
  const groups = groupBookings(bookings);
  const byRequest = bookingsByRequest(bookings);

  const requests = data ?? [];
  const incoming = requests.filter((r) => effectiveStatus(r) === "pending");
  const past = requests.filter((r) => effectiveStatus(r) !== "pending");

  return (
    <AppLayout mode="host" title="Bookings" description="Manage storage requests and bookings.">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && requests.length === 0 && bookings.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="When a renter asks to store their belongings in one of your spaces, it'll appear here."
        />
      ) : null}

      {requests.length > 0 || bookings.length > 0 ? (
        <div className="space-y-8">
          {GROUP_ORDER.map((group) =>
            groups[group].length === 0 ? null : (
              <section key={group}>
                <h2 className="type-h3">{GROUP_LABEL[group]}</h2>
                <p className="mt-1 type-body-sm text-muted-foreground">{GROUP_NOTE[group]}</p>
                <ul className="mt-3 space-y-3">
                  {groups[group].map((booking) => (
                    <li key={booking.id}>
                      <HostBookingCard
                        booking={booking}
                        viewerId={user?.id ?? null}
                        cancellation={cancellations.get(booking.id) ?? null}
                        earningsPence={cumulativeHostStoragePence(earnings[booking.id])}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}

          <RequestGroup
            title="Incoming requests"

            emptyNote="Nothing needs your response right now."
            requests={incoming}
            showEmpty
          />
          <RequestGroup title="Past requests" requests={past} bookings={byRequest} />
          <p className="type-body-sm text-muted-foreground">{REQUEST_LIST_DISCLAIMER}</p>
        </div>
      ) : null}
    </AppLayout>
  );
}

/** Who asked for the cancellation, in host-facing words. */
function cancellationActorLabel(role: string): string {
  if (role === "renter") return "the renter";
  if (role === "host") return "you";
  return `${brand.name}`;
}

const GROUP_NOTE: Record<LifecycleGroup, string> = {
  action: hostBookingDetail("pending_payment"),
  active: "Storage is under way or ready to start. Confirm each step as it happens.",
  upcoming: "Paid and confirmed. Get the space ready for the start date.",
  completed: "Finished bookings. The space is free again.",
  cancelled: hostBookingDetail("cancelled") + " The dates are available to book again.",
};

function HostBookingCard({
  booking,
  viewerId,
  cancellation = null,
  earningsPence = 0,
}: {
  booking: Booking;
  viewerId: string | null;
  cancellation?: BookingCancellationRow | null;
  earningsPence?: number;
}) {
  const view = bookingView(booking);
  const state = lifecycleState(booking);
  const meta = lifecycleMeta(state);
  const cancelled = state === "cancelled";
  const confirmed = booking.status === "confirmed" || booking.status === "active";
  const renter = booking.renter_first_name_snapshot?.trim();
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-h3 truncate">{view.spaceTitle}</h3>
          <p className="type-body-sm text-muted-foreground">
            {spaceTypeLabel(view.spaceType as SpaceTypeValue)}
            {view.area ? ` · ${view.area}` : ""}
          </p>
        </div>
        <Badge variant={meta.tone}>{meta.label}</Badge>
      </div>

      <p className="mt-3 type-body-sm">{view.period}</p>
      <p className="type-body-sm text-muted-foreground">
        {formatBookingDuration(booking)} · {view.itemCount} items ·{" "}
        {view.requirementM3.toFixed(2)} m³
      </p>
      <p className="type-body-sm text-muted-foreground">
        {renter ? `Requested by ${renter}` : "Requested by a renter"}
      </p>
      {cancelled && cancellation ? (
        <div className="mt-3 rounded-xl bg-muted/60 p-3">
          <p className="type-body-sm">
            Cancelled by {cancellationActorLabel(cancellation.requested_by_role)} on{" "}
            {new Date(cancellation.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {cancellation.reason?.trim() ? (
            <p className="mt-1 type-body-sm text-muted-foreground">
              Reason given: {cancellation.reason.trim()}
            </p>
          ) : null}
          <p className="mt-1 type-body-sm text-muted-foreground">
            These dates are available to book again.
          </p>
        </div>
      ) : null}

      {confirmed && earningsPence > 0 ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          {hostEarningsLabel(earningsPence)} (the renter also paid a separate {brand.name} service
          fee on top, which isn't part of your earnings).
        </p>
      ) : null}

      {booking.status === "confirmed" || booking.status === "active" ? (
        <div className="mt-4">
          <BookingLifecyclePanel
            booking={booking}
            viewerId={viewerId}
            paid
            audience="host"
          />
        </div>
      ) : null}
    </article>
  );
}

function RequestGroup({
  title,
  requests,
  emptyNote,
  showEmpty = false,
  bookings,
}: {
  title: string;
  requests: StorageRequest[];
  bookings?: Record<string, Booking>;
  emptyNote?: string;
  showEmpty?: boolean;
}) {
  if (requests.length === 0 && !showEmpty) return null;
  return (
    <section>
      <h2 className="type-h3">{title}</h2>
      {requests.length === 0 ? (
        <p className="mt-2 type-body-sm text-muted-foreground">{emptyNote}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {requests.map((request) => (
            <li key={request.id}>
              <HostRequestCard request={request} booking={bookings?.[request.id] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HostRequestCard({
  request,
  booking,
}: {
  request: StorageRequest;
  booking?: Booking | null;
}) {
  const view = requestSnapshotView(request);
  const expiry = expiryLabel(request);
  const renter = request.renter_first_name_snapshot?.trim();

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-h3 truncate">{view.spaceTitle}</h3>
          <p className="type-body-sm text-muted-foreground">
            {spaceTypeLabel(view.spaceType as SpaceTypeValue)}
            {view.area ? ` · ${view.area}` : ""}
          </p>
        </div>
        <RequestStatusBadge request={request} />
      </div>

      <p className="mt-3 type-body-sm">{view.period}</p>
      <p className="type-body-sm text-muted-foreground">
        {view.priceLabel} · {view.itemCount} items · {view.requirementM3.toFixed(2)} m³
        {view.spaceFitScore !== null ? ` · ${view.spaceFitScore}% SpaceFit` : ""}
      </p>
      <p className="type-body-sm text-muted-foreground">
        {renter ? `Requested by ${renter}` : "Requested by a verified renter"}
      </p>
      {expiry ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          Response requested by {new Date(request.expires_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      ) : null}

      {booking ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          Booking started · {bookingView(booking).statusLabel}
        </p>
      ) : null}

      <Button asChild variant="secondary" size="sm" className="mt-4">
        <Link to="/host/requests/$requestId" params={{ requestId: request.id }}>
          Review request
        </Link>
      </Button>
    </article>
  );
}
