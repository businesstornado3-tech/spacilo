/**
 * Guest SpaceFit — browser-side reference store.
 *
 * The reference is possession-based and short lived, so it lives in
 * sessionStorage: it disappears when the tab closes and is never sent to any
 * origin but ours. It is NOT a login and grants no access to account data.
 */
import type { GuestKind } from "@/lib/spacefit-guest/config";
import type { GuestSpaceProposal } from "@/lib/spacefit-guest/preview";

const REF_KEY = "stow.guest.spacefit.ref";
const PROPOSAL_KEY = "stow.guest.spacefit.proposal";

export interface GuestRef {
  token: string;
  kind: GuestKind;
  expiresAt: string;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeGuestRef(ref: GuestRef) {
  storage()?.setItem(REF_KEY, JSON.stringify(ref));
}

export function readGuestRef(now: Date = new Date()): GuestRef | null {
  const raw = storage()?.getItem(REF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestRef;
    if (!parsed?.token || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= now.getTime()) {
      clearGuestRef();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGuestRef() {
  storage()?.removeItem(REF_KEY);
}

/** Host proposals survive the claim so the listing wizard can show them. */
export function storeClaimedProposal(proposal: GuestSpaceProposal) {
  storage()?.setItem(PROPOSAL_KEY, JSON.stringify(proposal));
}

export function readClaimedProposal(): GuestSpaceProposal | null {
  const raw = storage()?.getItem(PROPOSAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestSpaceProposal;
  } catch {
    return null;
  }
}

export function clearClaimedProposal() {
  storage()?.removeItem(PROPOSAL_KEY);
}
