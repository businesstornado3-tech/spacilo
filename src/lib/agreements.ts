/**
 * Bilateral Storage Agreement — pure domain helpers.
 *
 * The renter and the host each accept the SAME published version, independently.
 * Only then is the agreement ACTIVE, and only then will the database allow the
 * handover that finalises the items in the selected space
 * (`confirm_booking_handover` / `activate_booking` call
 * `stow_require_active_agreement`). Nothing here decides anything: the server
 * is the authority and this module only mirrors it for the interface.
 *
 * The agreement complements — never replaces — the Storage Policy engine,
 * which remains authoritative for what may be stored.
 */

export type AgreementState =
  | "pending"
  | "renter_accepted"
  | "host_accepted"
  | "active"
  | "requires_reacceptance"
  | "superseded"
  | "cancelled";

export type AgreementParty = "renter" | "host" | "staff";

export interface AgreementSection {
  heading: string;
  body: string;
}

export interface AgreementVersionView {
  id: string;
  version: string;
  title: string;
  summary: string;
  sections: AgreementSection[];
  effective_at: string | null;
}

export interface AgreementView {
  id: string;
  status: AgreementState;
  agreement_version_id: string;
  agreement_version: string;
  renter_accepted_at: string | null;
  host_accepted_at: string | null;
  activated_at: string | null;
}

export interface AgreementStateView {
  booking_id: string;
  viewer_party: AgreementParty;
  agreement: AgreementView | null;
  current_version: AgreementVersionView | null;
  version_current: boolean;
  active: boolean;
}

/** Has this viewer already accepted, as their own party? */
export function viewerAccepted(state: AgreementStateView): boolean {
  const agreement = state.agreement;
  if (!agreement) return false;
  if (state.viewer_party === "renter") return Boolean(agreement.renter_accepted_at);
  if (state.viewer_party === "host") return Boolean(agreement.host_accepted_at);
  return false;
}

export function otherPartyAccepted(state: AgreementStateView): boolean {
  const agreement = state.agreement;
  if (!agreement) return false;
  if (state.viewer_party === "renter") return Boolean(agreement.host_accepted_at);
  if (state.viewer_party === "host") return Boolean(agreement.renter_accepted_at);
  return Boolean(agreement.renter_accepted_at && agreement.host_accepted_at);
}

/**
 * ACTIVE requires both parties on the same version. Mirrors
 * `accept_storage_agreement`, which is the authority.
 */
export function isAgreementActive(state: AgreementStateView | null | undefined): boolean {
  const agreement = state?.agreement;
  if (!agreement) return false;
  return (
    agreement.status === "active" &&
    Boolean(agreement.renter_accepted_at) &&
    Boolean(agreement.host_accepted_at)
  );
}

/** May this viewer press "I Agree to the Storage Terms" right now? */
export function canAccept(state: AgreementStateView | null | undefined): boolean {
  if (!state?.agreement || !state.current_version) return false;
  if (state.viewer_party === "staff") return false;
  if (state.agreement.status === "superseded" || state.agreement.status === "cancelled") {
    return false;
  }
  if (!state.version_current) return false;
  return !viewerAccepted(state);
}

export type AgreementBlock =
  | "no_agreement"
  | "awaiting_host"
  | "awaiting_renter"
  | "awaiting_you"
  | "version_changed"
  | "requires_reacceptance"
  | "cancelled";

/** Why finalisation is not possible yet, or null when the agreement is ACTIVE. */
export function agreementBlock(state: AgreementStateView | null | undefined): AgreementBlock | null {
  if (!state || !state.agreement) return "no_agreement";
  const agreement = state.agreement;
  if (agreement.status === "cancelled" || agreement.status === "superseded") return "cancelled";
  if (agreement.status === "requires_reacceptance") return "requires_reacceptance";
  if (!state.version_current) return "version_changed";
  if (isAgreementActive(state)) return null;
  if (!viewerAccepted(state)) return "awaiting_you";
  return state.viewer_party === "host" ? "awaiting_renter" : "awaiting_host";
}

export const AGREEMENT_BLOCK_MESSAGE: Record<AgreementBlock, string> = {
  no_agreement:
    "The Storage Terms haven't been set up for this arrangement yet. Please refresh and try again.",
  awaiting_host:
    "You have accepted the Storage Terms, but the host has not yet accepted them. Your items cannot be finalised until both parties agree.",
  awaiting_renter:
    "The renter has not yet accepted the Storage Terms. The storage arrangement cannot become active until both parties agree.",
  awaiting_you: "Please read and accept the Storage Terms to continue.",
  version_changed:
    "The Storage Terms have changed. Both parties must review and accept the current version before the storage arrangement can become active.",
  requires_reacceptance:
    "The storage arrangement has changed and the Storage Terms need to be accepted again.",
  cancelled: "These Storage Terms no longer apply to this arrangement.",
};

/** Deterministic server errors, mapped to plain wording. */
export const AGREEMENT_ERRORS: Record<string, string> = {
  STORAGE_AGREEMENT_REQUIRED:
    "Both you and the other party need to accept the Storage Terms before the items can be finalised in this space.",
  STORAGE_AGREEMENT_VERSION_CHANGED:
    "The Storage Terms have changed. Please review and accept the current version.",
  STORAGE_AGREEMENT_NOT_A_PARTY: "Only the renter or the host on this booking can accept these terms.",
  STORAGE_AGREEMENT_UNAVAILABLE:
    "We can't load the Storage Terms right now. Please try again shortly.",
  STORAGE_AGREEMENT_ACCEPTANCE_IMMUTABLE: "An acceptance that has been recorded can't be changed.",
};

export function friendlyAgreementError(message: string, fallback: string): string {
  for (const [key, text] of Object.entries(AGREEMENT_ERRORS)) {
    if (message.includes(key)) return text;
  }
  return fallback;
}

export const AGREEMENT_STATUS_LABEL: Record<AgreementState, string> = {
  pending: "Not yet accepted",
  renter_accepted: "Renter accepted",
  host_accepted: "Host accepted",
  active: "Storage Agreement active",
  requires_reacceptance: "Needs accepting again",
  superseded: "Replaced by newer terms",
  cancelled: "Cancelled",
};

export const AGREEMENT_INTRO: Record<"renter" | "host", string> = {
  renter:
    "Before your items can be finalised in this space, you and the host must agree to the Storage Terms.",
  host:
    "Before the storage arrangement can become active, you and the renter must agree to the Storage Terms.",
};

export const AGREEMENT_CONFIRM_LABEL = "I confirm that I have read and agree to the Storage Terms.";
export const AGREEMENT_ACCEPT_LABEL = "I Agree to the Storage Terms";
