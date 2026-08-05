/**
 * "My requests" — every storage request this renter has sent, newest first.
 * Figures come from each request's snapshot, not from live listings.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState, ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/requests/RequestSummary";
import { useMyRequests } from "@/hooks/useStorageRequests";
import { useMyBookings } from "@/hooks/useBookings";
import {
  ACCEPTED_CTA_COPY,
  bookingActionState,
  bookingsByRequest,
  type Booking,
} from "@/lib/bookings";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import {
  REQUEST_LIST_DISCLAIMER,
  effectiveStatus,
  expiryLabel,
  requestSnapshotView,
} from "@/lib/storage-requests";

export const Route = createFileRoute("/_authenticated/renter/requests/")({
  head: () => ({
    meta: [
      { title: "My storage requests — " + brand.name },
      { name: "description", content: "Track the storage requests you've sent to hosts, and withdraw any that are still pending." },
      { property: "og:title", content: "My storage requests — " + brand.name },
      { property: "og:description", content: "Track the storage requests you've sent to hosts, and withdraw any that are still pending." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const { data, isLoading, error, refetch } = useMyRequests();
  const { data: bookingsData } = useMyBookings();
  const bookings = bookingsByRequest(bookingsData ?? []);
  const requests = data ?? [];
  const live = requests.filter((request) => effectiveStatus(request) === "pending");
  const past = requests.filter((request) => effectiveStatus(request) !== "pending");

  return (
    <AppLayout
      mode="renter"
      title="My requests"
      description="Storage requests you've sent to hosts. A request isn't a booking and doesn't hold the space."
    >
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="When you find a space that suits your stuff, send the host a request with your dates."
        />
      ) : null}

      {requests.length > 0 ? (
        <div className="space-y-8">
          <RequestGroup title="Awaiting a host response" requests={live} bookings={bookings} />
          <RequestGroup title="Past requests" requests={past} bookings={bookings} />
          <p className="type-body-sm text-muted-foreground">{REQUEST_LIST_DISCLAIMER}</p>
        </div>
      ) : null}
    </AppLayout>
  );
}

function RequestGroup({
  title,
  requests,
  bookings,
}: {
  title: string;
  bookings: Record<string, Booking>;
  requests: ReturnType<typeof useMyRequests>["data"] extends (infer T)[] | undefined ? T[] : never;
}) {
  if (requests.length === 0) return null;
  return (
    <section>
      <h2 className="type-h3">{title}</h2>
      <ul className="mt-3 space-y-3">
        {requests.map((request) => {
          const view = requestSnapshotView(request);
          const expiry = expiryLabel(request);
          const action = bookingActionState(request, bookings[request.id] ?? null);
          return (
            <li key={request.id}>
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
                  {view.spaceFitScore !== null ? ` · ${view.spaceFitScore}% fit` : ""}
                </p>
                {expiry ? (
                  <p className="mt-1 type-body-sm text-muted-foreground">{expiry}</p>
                ) : null}

                {action.kind === "continue" ? (
                  <p className="mt-3 type-body-sm text-muted-foreground">{ACCEPTED_CTA_COPY}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {action.kind === "continue" ? (
                    <Button asChild size="sm">
                      <Link
                        to="/renter/requests/$requestId/booking"
                        params={{ requestId: request.id }}
                      >
                        Continue to booking
                      </Link>
                    </Button>
                  ) : null}
                  {action.kind === "started" ? (
                    <Button asChild size="sm">
                      <Link
                        to="/renter/bookings/$bookingId"
                        params={{ bookingId: action.bookingId }}
                      >
                        View booking
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/renter/requests/$requestId" params={{ requestId: request.id }}>
                      View request
                    </Link>
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
