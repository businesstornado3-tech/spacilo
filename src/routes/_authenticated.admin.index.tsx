import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Canonical founder/admin entry point.
 *
 * `/admin` is the address a founder is told to type; it always lands on the
 * dashboard. Access itself is enforced in Postgres — every dashboard RPC
 * re-checks `is_platform_admin(auth.uid())`, so this redirect grants nothing.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard" });
  },
});
