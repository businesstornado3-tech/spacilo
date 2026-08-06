/**
 * Inbox presentation rules (Prompt 26B).
 *
 * This is a booking communication system, not a social chat. Everything here
 * is presentation over server-owned facts: the unread count, the archive flag
 * and the moderation status all come from the database, and nothing in this
 * module can change them.
 *
 * Privacy: a conversation summary carries a first name, a listing title and a
 * short message preview only. Phone numbers, emails and exact addresses are
 * never part of a thread — they live on the booking, after payment.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Conversation = Tables<"conversations">;

/** One row of `list_my_conversations`. */
export interface ConversationSummary {
  id: string;
  booking_id: string | null;
  space_id: string;
  space_title: string | null;
  cover_path: string | null;
  counterpart_name: string;
  counterpart_role: string;
  booking_status: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  archived: boolean;
  moderation_status: string;
}

export const CONVERSATION_REPORT_REASONS = [
  { value: "abusive", label: "Abusive or threatening" },
  { value: "spam", label: "Spam or advertising" },
  { value: "off_platform", label: "Asking to move off Spacilo" },
  { value: "personal_information", label: "Asking for personal contact details" },
  { value: "scam", label: "Possible scam or fraud" },
  { value: "other", label: "Something else" },
] as const;

export type ConversationReportReason = (typeof CONVERSATION_REPORT_REASONS)[number]["value"];

export const isValidReportReason = (value: string): value is ConversationReportReason =>
  CONVERSATION_REPORT_REASONS.some((r) => r.value === value);

/** True for a thread that exists before any booking. */
export const isEnquiryThread = (row: { booking_id: string | null }): boolean =>
  row.booking_id === null;

export const conversationTitle = (row: ConversationSummary): string =>
  row.space_title?.trim() || (isEnquiryThread(row) ? "Question about a space" : "Storage booking");

/** Newest activity first; threads that never had a message fall to the end. */
export function sortByLatest<T extends { last_message_at: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return bt - at;
  });
}

/** Search over titles, counterpart names and previews. Case and space tolerant. */
export function searchConversations(
  rows: ConversationSummary[],
  term: string,
): ConversationSummary[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [conversationTitle(row), row.counterpart_name, row.last_message_preview ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export const totalUnread = (rows: ConversationSummary[]): number =>
  rows.reduce((sum, row) => sum + Math.max(0, row.unread_count), 0);

export const inboxBadge = (count: number): string => (count > 99 ? "99+" : String(count));

/** One-line preview; never more than a sentence of somebody's message. */
export function previewText(row: ConversationSummary, max = 90): string {
  const body = (row.last_message_preview ?? "").replace(/\s+/g, " ").trim();
  if (!body) return "No messages yet";
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body;
}

/** A hidden thread is readable by nobody but the moderation queue. */
export const isHidden = (row: { moderation_status: string }): boolean =>
  row.moderation_status === "hidden";

export const isUnderReview = (row: { moderation_status: string }): boolean =>
  row.moderation_status === "under_review";

export const MODERATION_NOTICE =
  "This conversation has been reported and is being reviewed by the Spacilo team.";

/**
 * Copy shown above every thread. Deliberately the same before and after a
 * booking: keeping messages on Spacilo is what makes support, evidence and
 * refunds possible.
 */
export const PRIVACY_NOTICE =
  "Keep messages in Spacilo. Phone numbers, emails and the exact address are never shared here — the full address appears on the booking once it's confirmed.";

export const ADDRESS_NOTICE: Record<"before" | "after", string> = {
  before: "The exact address stays hidden until a booking is confirmed.",
  after: "The exact address is on the booking page, not in this thread.",
};

/** Whether the viewer may already see the exact address for this thread. */
export function addressVisibility(bookingStatus: string | null | undefined): "before" | "after" {
  return bookingStatus === "confirmed" || bookingStatus === "active" || bookingStatus === "completed"
    ? "after"
    : "before";
}
