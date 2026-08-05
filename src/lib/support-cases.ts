/**
 * Support cases (Prompt 18) — pure domain module.
 *
 * A support case is a record ABOUT a booking. It never edits handover
 * evidence, condition notes, inventory snapshots, payments or refunds; it
 * references them. Everything here is presentation and mapping only — every
 * real write is authorised again by RLS and by the server-side case functions.
 */
import type { Enums, Tables } from "@/integrations/supabase/types";

export type SupportCase = Tables<"booking_support_cases">;
export type SupportCaseMessage = Tables<"booking_support_case_messages">;
export type SupportCaseEvent = Tables<"booking_support_case_events">;
export type SupportCaseEvidence = Tables<"booking_support_case_evidence">;

export type SupportCaseCategory = Enums<"support_case_category">;
export type SupportCaseStage = Enums<"support_case_stage">;
export type SupportCaseStatus = Enums<"support_case_status">;
export type SupportResolutionCode = Enums<"support_resolution_code">;
export type HandoverIssueCategory = Enums<"handover_issue_category">;

export type CaseParty = "renter" | "host";

/* ------------------------------------------------------------- categories */

export const CASE_CATEGORY_LABEL: Record<SupportCaseCategory, string> = {
  inventory_mismatch: "Belongings differ from the agreed inventory",
  quantity_mismatch: "Quantity differs",
  belongings_damage: "Belongings damaged",
  space_damage: "Storage space damaged",
  condition_concern: "Condition concern",
  access_problem: "Access problem",
  handover_problem: "Handover problem",
  collection_problem: "Collection problem",
  prohibited_item: "Prohibited or restricted item concern",
  missing_belongings: "Belongings missing or unavailable",
  cancellation_problem: "Cancellation problem",
  extension_problem: "Extension problem",
  payment_problem: "Payment problem",
  refund_problem: "Refund problem",
  other: "Something else",
};

export const CASE_CATEGORIES = Object.keys(CASE_CATEGORY_LABEL) as SupportCaseCategory[];

/* ----------------------------------------------------------------- stages */

export const CASE_STAGE_LABEL: Record<SupportCaseStage, string> = {
  before_storage: "Before storage started",
  checkin: "At handover",
  during_storage: "During storage",
  checkout: "At collection",
  after_storage: "After storage ended",
  cancellation: "Around a cancellation",
  extension: "Around an extension",
  payment: "Around a payment",
  other: "Something else",
};

export const CASE_STAGES = Object.keys(CASE_STAGE_LABEL) as SupportCaseStage[];

/* --------------------------------------------------------------- statuses */

/** Customer-friendly wording. No legalistic language. */
export function statusLabel(status: SupportCaseStatus, viewerIsReporter: boolean): string {
  switch (status) {
    case "open":
      return "Open";
    case "under_review":
      return "Under review";
    case "waiting_for_reporter":
      return viewerIsReporter ? "Waiting for you" : "Waiting for the other person";
    case "waiting_for_other_party":
      return viewerIsReporter ? "Waiting for the other person" : "Waiting for you";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Resolved";
  }
}

/** Support-side wording: no viewer perspective, closed is distinct. */
export const STAFF_STATUS_LABEL: Record<SupportCaseStatus, string> = {
  open: "Open",
  waiting_for_other_party: "Waiting for other party",
  waiting_for_reporter: "Waiting for reporter",
  under_review: "Under review",
  resolved: "Resolved",
  closed: "Closed",
};

export const OPEN_STATUSES: SupportCaseStatus[] = [
  "open",
  "waiting_for_other_party",
  "waiting_for_reporter",
  "under_review",
];

export const isCaseLive = (status: SupportCaseStatus) => OPEN_STATUSES.includes(status);

/** True when this case is currently waiting on the signed-in participant. */
export function awaitingViewer(kase: SupportCase, userId: string | null | undefined): boolean {
  if (!userId) return false;
  const reporter = kase.opened_by_user_id === userId;
  if (kase.status === "waiting_for_reporter") return reporter;
  if (kase.status === "waiting_for_other_party") return !reporter;
  return false;
}

export function statusHelpText(kase: SupportCase, userId: string | null | undefined): string {
  if (kase.status === "resolved" || kase.status === "closed") return "This case has been resolved.";
  if (awaitingViewer(kase, userId)) return "Support is waiting for your response.";
  if (kase.status === "under_review") return "We're reviewing the information provided.";
  if (kase.status === "waiting_for_reporter" || kase.status === "waiting_for_other_party") {
    return "We're waiting for the other person to respond.";
  }
  return "This case has been sent to support.";
}

/* ------------------------------------------------------------ resolutions */

export const RESOLUTION_LABEL: Record<SupportResolutionCode, string> = {
  no_action: "No further action",
  information_only: "Information provided",
  agreement_reached: "Agreement reached between both people",
  refund_full: "Refund of the full remaining amount",
  refund_partial: "Partial refund",
  host_adjustment: "Host balance adjustment",
  renter_adjustment: "Renter adjustment",
  booking_cancelled: "Booking cancelled",
  other: "Other outcome",
};

/** Resolutions support can record without touching money. */
export const NON_FINANCIAL_RESOLUTIONS: SupportResolutionCode[] = [
  "no_action",
  "information_only",
  "agreement_reached",
  "booking_cancelled",
  "other",
];

/* --------------------------------- Prompt 15 issue → Prompt 18 category */

/**
 * A Prompt 15 handover issue is the participant's immutable account of a
 * mismatch. Escalating it creates a NEW case that references it — the original
 * row is never modified or copied.
 */
export const ISSUE_TO_CASE_CATEGORY: Record<HandoverIssueCategory, SupportCaseCategory> = {
  items_differ: "inventory_mismatch",
  quantity_differs: "quantity_mismatch",
  condition_concern: "condition_concern",
  access_problem: "access_problem",
  restricted_item: "prohibited_item",
  other: "other",
};

export const caseCategoryForIssue = (category: HandoverIssueCategory): SupportCaseCategory =>
  ISSUE_TO_CASE_CATEGORY[category] ?? "other";

/** Handover stage → case stage. */
export const stageForHandoverStage = (stage: Enums<"handover_stage">): SupportCaseStage =>
  stage === "check_in" ? "checkin" : "checkout";

/* ------------------------------------------------------------ attribution */

export function messageAttribution(role: string): string {
  if (role === "host") return "Added by the host";
  if (role === "support") return "Added by support";
  return "Added by the renter";
}

export const reporterLabel = (kase: SupportCase, userId: string | null | undefined) =>
  kase.opened_by_user_id === userId
    ? "Reported by you"
    : kase.opened_by_role === "host"
      ? "Reported by the host"
      : "Reported by the renter";

/* ------------------------------------------------------------- visibility */

/**
 * Participant presentation NEVER includes internal support notes. The database
 * already withholds them through RLS; this is the second belt so a mapping
 * mistake can't leak one into a participant view.
 */
export const participantVisibleMessages = (messages: SupportCaseMessage[]) =>
  messages.filter((m) => m.visibility === "participants");

export const participantVisibleEvents = (events: SupportCaseEvent[]) =>
  events
    .filter((e) => e.visibility === "participants")
    .map((e) => ({ ...e, internal_note: null }));

/* ------------------------------------------------------------------ money */

/** Integer pence only — never floating point money. */
export function remainingRefundablePence(paidPence: number, refundedPence: number): number {
  const remaining = Math.trunc(paidPence) - Math.trunc(refundedPence);
  return remaining > 0 ? remaining : 0;
}

/** Parses "12.34" / "£12.34" into whole pence. Returns null when unusable. */
export function poundsInputToPence(value: string): number | null {
  const cleaned = value.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(pence) ? pence : null;
}

export function refundAmountProblem(amountPence: number | null, remainingPence: number): string | null {
  if (amountPence === null) return "Enter an amount like 10.00.";
  if (amountPence <= 0) return "Enter an amount greater than zero.";
  if (amountPence > remainingPence) return "The refund amount is higher than the remaining refundable amount.";
  return null;
}

/** Distinguishes a base booking payment from an extension payment. */
export const paymentKindLabel = (isExtension: boolean) =>
  isExtension ? "Extension payment" : "Booking payment";

/* -------------------------------------------------------------- evidence */

export const CASE_EVIDENCE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const CASE_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

/** `<booking>/cases/<case>/<uploader>/<uuid>.<ext>` — matched by RLS and storage policy. */
export function caseEvidencePath(input: {
  bookingId: string;
  caseId: string;
  uploaderId: string;
  fileName: string;
}): string {
  const ext = (input.fileName.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${input.bookingId}/cases/${input.caseId}/${input.uploaderId}/${crypto.randomUUID()}.${ext || "jpg"}`;
}

export function evidenceFileProblem(file: { type: string; size: number }): string | null {
  if (!CASE_EVIDENCE_MIME.includes(file.type)) return "That file couldn't be uploaded — use a JPEG, PNG or WebP image.";
  if (file.size > CASE_EVIDENCE_MAX_BYTES) return "That photo is larger than 8MB.";
  return null;
}

export const SUPPORT_CASE_DISCLAIMER =
  "This creates a support case and keeps the booking record, messages and evidence together for review.";
