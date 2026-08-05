/**
 * Single source of truth for the two SpaceFit entry points.
 *
 * Signed in:
 *  "Scan my stuff" → the real renter photo-scan flow (Prompt 21/21B).
 *  "Scan my space" → the real host listing wizard, which contains the scanner.
 *
 * Signed out: the guest preview routes. A visitor gets a genuinely useful,
 * deliberately limited SpaceFit result first; account creation comes at the
 * point it buys them something (saving, matching, listing, booking).
 */
import { hostEntryTarget } from "@/lib/host-entry";

export type ScanStuffTarget = { to: "/renter/inventory/photos" } | { to: "/spacefit/stuff" };

export function scanStuffTarget(isAuthenticated: boolean): ScanStuffTarget {
  return isAuthenticated ? { to: "/renter/inventory/photos" } : { to: "/spacefit/stuff" };
}

export type ScanSpaceTarget = { to: "/host/spaces/new" } | { to: "/spacefit/space" };

export function scanSpaceTarget(isAuthenticated: boolean): ScanSpaceTarget {
  return isAuthenticated ? { to: "/host/spaces/new" } : { to: "/spacefit/space" };
}

/** Listing (rather than scanning) still routes through the host entry path. */
export { hostEntryTarget };
