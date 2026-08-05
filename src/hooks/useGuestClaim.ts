/**
 * Guest SpaceFit — claim on sign-in.
 *
 * Runs once, right after a session appears, and moves a guest preview into the
 * new account's own records. Claiming is best-effort by design: a failure must
 * never block someone from getting into their account.
 */
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";

import { claimGuestSpaceFit } from "@/lib/spacefit-guest.functions";
import {
  clearGuestRef,
  readGuestRef,
  storeClaimedProposal,
} from "@/lib/spacefit-guest/session-store";

/** Where a claimed scan should land the user. */
export const GUEST_CLAIM_DESTINATION = {
  renter: "/renter/inventory/review",
  host: "/host/spaces/new",
} as const;

export function useGuestClaim() {
  const claim = useServerFn(claimGuestSpaceFit);

  /**
   * Claims any pending guest scan and returns where to send the user, or null
   * when there is nothing to claim.
   */
  return React.useCallback(async (): Promise<string | null> => {
    const ref = readGuestRef();
    if (!ref) return null;
    try {
      const response = await claim({ data: { token: ref.token } });
      clearGuestRef();
      if (!response.ok) return null;
      if (response.result.kind === "host") {
        storeClaimedProposal(response.result.proposal);
        return GUEST_CLAIM_DESTINATION.host;
      }
      return GUEST_CLAIM_DESTINATION.renter;
    } catch {
      clearGuestRef();
      return null;
    }
  }, [claim]);
}
