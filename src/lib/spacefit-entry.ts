/**
 * Single source of truth for the two homepage SpaceFit entry points.
 *
 * "Scan my stuff" → the real renter photo-scan flow (Prompt 21/21B).
 * "Scan my space" → the real host listing wizard, which contains the space scanner.
 *
 * Signed-out visitors go through the existing signup flow with the right mode,
 * which already lands them in the matching dashboard after sign-up.
 */
import { hostEntryTarget, type HostEntryTarget } from "@/lib/host-entry";

export type ScanStuffTarget =
  | { to: "/renter/inventory/photos" }
  | { to: "/signup"; search: { mode: "renter" } };

export function scanStuffTarget(isAuthenticated: boolean): ScanStuffTarget {
  return isAuthenticated
    ? { to: "/renter/inventory/photos" }
    : { to: "/signup", search: { mode: "renter" } };
}

/** Host scanning lives inside the listing wizard, so it reuses the host entry path. */
export function scanSpaceTarget(isAuthenticated: boolean): HostEntryTarget {
  return hostEntryTarget(isAuthenticated);
}
