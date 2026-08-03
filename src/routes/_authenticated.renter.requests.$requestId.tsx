/**
 * Layout for a single storage request. The request detail page lives in the
 * sibling index route; the booking review page is a child route, so this
 * component only renders the matched child.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/renter/requests/$requestId")({
  component: () => <Outlet />,
});
