/**
 * "Request this space" CTA on a public listing.
 *
 * Signed-out visitors are invited to sign in, renters without confirmed items
 * are pointed at My Stuff, and any live relationship the signed-in renter
 * already has with this listing (pending request, accepted request, booking)
 * replaces the request CTA with the right next step instead of letting them
 * start the same journey twice. Self-requesting is blocked server-side,
 * because the public listing projection deliberately never exposes the
 * host's id.
 */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveInventory, useInventoryItems } from "@/hooks/useInventory";
import { useMyRequestsForSpace } from "@/hooks/useStorageRequests";
import { useMyBookingsForSpace } from "@/hooks/useBookings";
import { spaceCtaState } from "@/lib/space-cta";
import { ACCEPTED_EXPIRED_COPY, bookingStatusMeta, bookingWindowLabel } from "@/lib/bookings";
import { REQUEST_DISCLAIMER } from "@/lib/storage-requests";
import { track } from "@/lib/analytics/tracker";

export function RequestSpaceCta({ spaceId }: { spaceId: string }) {
  const { user } = useAuth();
  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { data: requests } = useMyRequestsForSpace(spaceId);
  const { data: bookings } = useMyBookingsForSpace(spaceId);

  const hasItems = (items?.length ?? 0) > 0;

  const shell = (children: React.ReactNode) => (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">{children}</section>
  );

  if (!user) {
    return shell(
      <>
        <h2 className="type-h3">Want to store here?</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Sign in to send the host a storage request with your dates and what you&apos;re storing.
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link to="/login" search={{ redirect: `/spaces/${spaceId}` }}>
            Sign in to request
          </Link>
        </Button>
      </>,
    );
  }

  const state = spaceCtaState(requests ?? [], bookings ?? []);

  if (state.kind === "booking") {
    const confirmed = state.status === "confirmed";
    return shell(
      <>
        <h2 className="type-h3">{confirmed ? "Booking confirmed" : "Booking awaiting payment"}</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {confirmed
            ? "Your booking for this space is confirmed."
            : "You've already started a booking for this space."}
        </p>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {bookingStatusMeta(state.status).detail}
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link to="/renter/bookings/$bookingId" params={{ bookingId: state.bookingId }}>
            View booking
          </Link>
        </Button>
      </>,
    );
  }

  if (state.kind === "continue") {
    const request = (requests ?? []).find((r) => r.id === state.requestId);
    return shell(
      <>
        <h2 className="type-h3">Your request was accepted</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          The host accepted your request. Continue when you&apos;re ready.
        </p>
        {request && bookingWindowLabel(request) ? (
          <p className="mt-1 type-body-sm text-muted-foreground">{bookingWindowLabel(request)}</p>
        ) : null}
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link
            to="/renter/requests/$requestId/booking"
            params={{ requestId: state.requestId }}
          >
            Continue to booking
          </Link>
        </Button>
      </>,
    );
  }

  if (state.kind === "accepted_expired") {
    return shell(
      <>
        <h2 className="type-h3">This acceptance has expired</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">{ACCEPTED_EXPIRED_COPY}</p>
        <Button asChild variant="secondary" className="mt-4 w-full sm:w-auto">
          <Link to="/renter/requests/$requestId" params={{ requestId: state.requestId }}>
            View request
          </Link>
        </Button>
      </>,
    );
  }

  if (state.kind === "pending") {
    return shell(
      <>
        <h2 className="type-h3">Request awaiting host response</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          You&apos;ve already sent a request for this space. You can review or withdraw it at any
          time.
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link to="/renter/requests/$requestId" params={{ requestId: state.requestId }}>
            View request
          </Link>
        </Button>
      </>,
    );
  }

  if (!hasItems) {
    return shell(
      <>
        <h2 className="type-h3">Add your stuff to request this space</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Hosts need to know roughly what you&apos;re storing before they can respond.
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link to="/renter/inventory">Add my stuff</Link>
        </Button>
      </>,
    );
  }

  return shell(
    <>
      <h2 className="type-h3">Request this space</h2>
      <p className="mt-1 type-body-sm text-muted-foreground">{REQUEST_DISCLAIMER}</p>
      <Button
        asChild
        className="mt-4 w-full sm:w-auto"
        onClick={() => track("storage_request_started", { props: { space_id: spaceId } })}
      >
        <Link to="/renter/requests/new" search={{ spaceId }}>
          Request this space
        </Link>
      </Button>
    </>,
  );
}
