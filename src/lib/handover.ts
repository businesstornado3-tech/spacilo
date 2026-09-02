/**
 * Handover, evidence and condition record (Prompt 15).
 *
 * This module is pure: it describes WHEN an evidence stage is open, WHO may
 * write to it and HOW it reads. Every real write is authorised again by RLS
 * (`booking_party_role`, `booking_stage_open`) and the existing Prompt 14
 * confirmation RPCs remain the only things that move a booking on.
 *
 * Nothing here certifies condition. Photos and notes are a record provided by
 * the renter and the host, never a EarnRoom or AI verification.
 */
import type { Enums, Tables } from "@/integrations/supabase/types";
import type { LifecycleBooking } from "@/lib/bookings-lifecycle";

export type HandoverStage = Enums<"handover_stage">;
export type HandoverIssueCategory = Enums<"handover_issue_category">;
export type EvidencePhoto = Tables<"booking_evidence_photos">;
export type ConditionNote = Tables<"booking_condition_notes">;
export type HandoverIssue = Tables<"booking_handover_issues">;

export type Party = "renter" | "host";

export const STAGE_LABEL: Record<HandoverStage, string> = {
  check_in: "Handover",
  check_out: "Collection",
};

/** Mirrors the `booking_stage_open` database function exactly. */
export function stageOpen(status: string, stage: HandoverStage): boolean {
  return stage === "check_in"
    ? status === "confirmed" || status === "active"
    : status === "active";
}

/**
 * Which stages a booking should display. Completed bookings show a read-only
 * record; cancelled bookings never enter the handover flow.
 */
export function visibleStages(booking: Pick<LifecycleBooking, "status">): HandoverStage[] {
  switch (booking.status) {
    case "confirmed":
      return ["check_in"];
    case "active":
      return ["check_in", "check_out"];
    case "completed":
      return ["check_in", "check_out"];
    default:
      return [];
  }
}

/** Read-only once the lifecycle stage has closed (completed or cancelled). */
export const stageReadOnly = (status: string, stage: HandoverStage) => !stageOpen(status, stage);

export const CONFIRMATION_STATEMENT: Record<HandoverStage, Record<Party, string>> = {
  check_in: {
    renter: "I confirm these belongings have been handed to the host for this booking.",
    host: "I confirm I have received the belongings for this booking.",
  },
  check_out: {
    renter: "I confirm I have collected my belongings.",
    host: "I confirm the belongings have been removed and the storage space is clear.",
  },
};

export const EVIDENCE_DISCLAIMER =
  "Photos and notes are provided by the renter and host as a record of the handover.";

export const ISSUE_CATEGORY_LABEL: Record<HandoverIssueCategory, string> = {
  items_differ: "Items differ from the agreed inventory",
  quantity_differs: "Quantity differs",
  condition_concern: "Visible damage or condition concern",
  access_problem: "Access or handover problem",
  restricted_item: "Prohibited or restricted item concern",
  other: "Something else",
};

export const ISSUE_CATEGORIES = Object.keys(ISSUE_CATEGORY_LABEL) as HandoverIssueCategory[];

/**
 * Evidence file path: booking → stage → uploader → file. The storage policies
 * read folder 1 (booking) and folder 3 (uploader), so this layout is what
 * keeps a file reachable by exactly the two people on the booking.
 */
export function evidencePath(input: {
  bookingId: string;
  stage: HandoverStage;
  uploaderId: string;
  fileName: string;
}): string {
  const ext = (input.fileName.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${input.bookingId}/${input.stage}/${input.uploaderId}/${crypto.randomUUID()}.${ext || "jpg"}`;
}

/** "Recorded by the renter" — attribution wording, never a verified claim. */
export const attribution = (role: string) =>
  role === "host" ? "Recorded by the host" : "Recorded by the renter";

export function partyFor(
  booking: { renter_id: string; host_id: string },
  userId: string | null | undefined,
): Party | null {
  if (!userId) return null;
  if (booking.renter_id === userId) return "renter";
  if (booking.host_id === userId) return "host";
  return null;
}

/** True when this stage has nothing to show, so the UI can stay compact. */
export const stageEmpty = (photos: unknown[], notes: unknown[]) =>
  photos.length === 0 && notes.length === 0;
