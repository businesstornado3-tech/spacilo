/**
 * "Request this space" CTA on a public listing.
 *
 * Signed-out visitors are invited to sign in, renters without confirmed items
 * are pointed at My Stuff, hosts can't request their own space, and a live
 * pending request links to itself rather than creating a duplicate.
 */
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveInventory, useInventoryItems } from "@/hooks/useInventory";
import { usePendingRequestForSpace } from "@/hooks/useStorageRequests";
import { REQUEST_DISCLAIMER } from "@/lib/storage-requests";
import { track } from "@/lib/analytics";

export function RequestSpaceCta({ spaceId, hostId }: { spaceId: string; hostId: string | null }) {
  const { user } = useAuth();
  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { data: pending } = usePendingRequestForSpace(spaceId);

  const isOwnSpace = Boolean(user && hostId && user.id === hostId);
  const hasItems = (items?.length ?? 0) > 0;

  const shell = (children: React.ReactNode) => (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">{children}</section>
  );

  if (isOwnSpace) {
    return shell(
      <p className="type-body-sm text-muted-foreground">
        This is your own listing, so you can&apos;t send it a storage request.
      </p>,
    );
  }

  if (pending) {
    return shell(
      <>
        <h2 className="type-h3">You&apos;ve already requested this space</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Your request is with the host. You can review or withdraw it at any time.
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link to="/renter/requests/$requestId" params={{ requestId: pending.id }}>
            View your request
          </Link>
        </Button>
      </>,
    );
  }

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
        onClick={() => track("storage_request_started", { space_id: spaceId })}
      >
        <Link to="/renter/requests/new" search={{ spaceId }}>
          Request this space
        </Link>
      </Button>
    </>,
  );
}
