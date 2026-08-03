/**
 * A single storage request, rendered entirely from its snapshot so history
 * never changes when a host reprices or a renter edits their inventory.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { toast } from "@/components/overlay/toast";
import { RequestSummary } from "@/components/requests/RequestSummary";
import { useRequest, useWithdrawRequest } from "@/hooks/useStorageRequests";
import { useBookingForRequest } from "@/hooks/useBookings";
import {
  ACCEPTED_CTA_COPY,
  ACCEPTED_EXPIRED_COPY,
  BOOKING_STARTED_COPY,
  bookingActionState,
  bookingWindowLabel,
} from "@/lib/bookings";
import { isWithdrawable, statusMeta, effectiveStatus } from "@/lib/storage-requests";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/renter/requests/$requestId/")({
  head: () => ({
    meta: [
      { title: "Storage request — " + brand.name },
      { name: "description", content: "Review the dates, belongings, price and SpaceFit captured when you sent this storage request." },
      { property: "og:title", content: "Storage request — " + brand.name },
      { property: "og:description", content: "Review the dates, belongings, price and SpaceFit captured when you sent this storage request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestDetailPage,
});

function RequestDetailPage() {
  const { requestId } = Route.useParams();
  const { data: request, isLoading, error, refetch } = useRequest(requestId);
  const { data: booking } = useBookingForRequest(requestId);
  const withdraw = useWithdrawRequest();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const onWithdraw = async () => {
    if (!request) return;
    try {
      await withdraw.mutateAsync(request.id);
      track("storage_request_withdrawn", { space_id: request.space_id });
      toast.success("Request withdrawn", "The host will no longer see this request.");
      setConfirmOpen(false);
    } catch {
      toast.error("We couldn't withdraw that request", "Please try again.");
    }
  };

  return (
    <AppLayout
      mode="renter"
      title="Storage request"
      description="Everything below was captured when you sent this request."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/renter/requests">All requests</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && !request ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h2 className="type-h3">Request not found</h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            It may have been removed, or it belongs to another account.
          </p>
          <Button asChild className="mt-5">
            <Link to="/renter/requests">Back to my requests</Link>
          </Button>
        </div>
      ) : null}

      {request ? (
        <div className="max-w-2xl space-y-6">
          <p className="type-body-sm text-muted-foreground">
            {statusMeta(effectiveStatus(request)).detail}
          </p>

          {(() => {
            const action = bookingActionState(request, booking ?? null);
            if (action.kind === "continue") {
              return (
                <section className="rounded-2xl border border-border bg-accent-soft p-5">
                  <h2 className="type-h3">Ready to continue?</h2>
                  <p className="mt-1 type-body-sm text-muted-foreground">{ACCEPTED_CTA_COPY}</p>
                  {bookingWindowLabel(request) ? (
                    <p className="mt-1 type-body-sm text-muted-foreground">
                      {bookingWindowLabel(request)}
                    </p>
                  ) : null}
                  <Button asChild className="mt-4">
                    <Link
                      to="/renter/requests/$requestId/booking"
                      params={{ requestId: request.id }}
                    >
                      Continue to booking
                    </Link>
                  </Button>
                </section>
              );
            }
            if (action.kind === "started") {
              return (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h2 className="type-h3">Booking started</h2>
                  <p className="mt-1 type-body-sm text-muted-foreground">{BOOKING_STARTED_COPY}</p>
                  <Button asChild className="mt-4">
                    <Link to="/renter/bookings/$bookingId" params={{ bookingId: action.bookingId }}>
                      View booking
                    </Link>
                  </Button>
                </section>
              );
            }
            if (action.kind === "expired") {
              return (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h2 className="type-h3">This acceptance has expired</h2>
                  <p className="mt-1 type-body-sm text-muted-foreground">{ACCEPTED_EXPIRED_COPY}</p>
                </section>
              );
            }
            return null;
          })()}

          <RequestSummary request={request} />

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link to="/spaces/$spaceId" params={{ spaceId: request.space_id }}>
                View the listing
              </Link>
            </Button>
            {isWithdrawable(request) ? (
              <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
                Withdraw request
              </Button>
            ) : null}
          </div>

          <Modal
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Withdraw this request?"
            description="The host will no longer see it. You can always send a new request later."
          >
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void onWithdraw()} disabled={withdraw.isPending}>
                {withdraw.isPending ? "Withdrawing…" : "Yes, withdraw"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Keep it
              </Button>
            </div>
          </Modal>
        </div>
      ) : null}
    </AppLayout>
  );
}
