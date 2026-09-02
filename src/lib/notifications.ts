/**
 * Notifications (Prompt 20) — presentation rules only.
 *
 * A notification is a record ABOUT a domain event; it is never the authority
 * for that event. Reading, archiving or deleting a notification changes
 * nothing about the booking, payment, refund, support case or review it
 * describes. Outstanding work still lives in "Needs your attention", which is
 * derived from authoritative state in `bookings-lifecycle.ts`.
 *
 * Every trusted notification row is written by a database trigger on the
 * authoritative table. Nothing in this module creates notifications.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Notification = Tables<"user_notifications">;
export type NotificationPriority = "informational" | "action_required" | "important";

export const NOTIFICATION_PAGE_SIZE = 20;

/** The constrained event vocabulary, mirroring the database CHECK constraint. */
export const NOTIFICATION_EVENT_TYPES = [
  "booking_request_received",
  "booking_request_accepted",
  "booking_request_declined",
  "booking_payment_required",
  "booking_payment_confirmed",
  "booking_payment_failed",
  "handover_confirmation_required",
  "handover_confirmed_by_other_party",
  "storage_started",
  "collection_confirmation_required",
  "collection_confirmed_by_other_party",
  "booking_completed",
  "new_booking_message",
  "handover_issue_reported",
  "extension_requested",
  "extension_accepted",
  "extension_declined",
  "extension_payment_required",
  "extension_confirmed",
  "extension_dates_unavailable",
  "booking_cancelled",
  "refund_processing",
  "refund_completed",
  "refund_requires_attention",
  "early_termination_requested",
  "early_termination_accepted",
  "early_termination_declined",
  "support_case_opened",
  "support_response_added",
  "support_information_required",
  "support_case_resolved",
  "review_available",
  "review_published",
  "review_report_update",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Short human label for an event type — used for grouping and screen readers. */
const EVENT_LABEL: Record<NotificationEventType, string> = {
  booking_request_received: "Storage request",
  booking_request_accepted: "Request accepted",
  booking_request_declined: "Request declined",
  booking_payment_required: "Payment required",
  booking_payment_confirmed: "Payment confirmed",
  booking_payment_failed: "Payment failed",
  handover_confirmation_required: "Handover",
  handover_confirmed_by_other_party: "Handover",
  storage_started: "Storage started",
  collection_confirmation_required: "Collection",
  collection_confirmed_by_other_party: "Collection",
  booking_completed: "Booking complete",
  new_booking_message: "Message",
  handover_issue_reported: "Issue recorded",
  extension_requested: "Extension",
  extension_accepted: "Extension",
  extension_declined: "Extension",
  extension_payment_required: "Extension payment",
  extension_confirmed: "Extension confirmed",
  extension_dates_unavailable: "Extension problem",
  booking_cancelled: "Cancellation",
  refund_processing: "Refund",
  refund_completed: "Refund",
  refund_requires_attention: "Refund",
  early_termination_requested: "Ending early",
  early_termination_accepted: "Ending early",
  early_termination_declined: "Ending early",
  support_case_opened: "Support",
  support_response_added: "Support",
  support_information_required: "Support",
  support_case_resolved: "Support",
  review_available: "Reviews",
  review_published: "Reviews",
  review_report_update: "Reviews",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType as NotificationEventType] ?? "Update";
}

/**
 * Presentation priority. The database stores this; we fall back to a mapping
 * so an unknown value never renders as a broken badge. Priority affects
 * appearance only — it never changes business behaviour.
 */
const EVENT_PRIORITY: Partial<Record<NotificationEventType, NotificationPriority>> = {
  booking_request_received: "action_required",
  booking_request_accepted: "action_required",
  booking_payment_required: "action_required",
  booking_payment_failed: "action_required",
  handover_confirmation_required: "action_required",
  handover_confirmed_by_other_party: "action_required",
  collection_confirmation_required: "action_required",
  collection_confirmed_by_other_party: "action_required",
  extension_requested: "action_required",
  extension_payment_required: "action_required",
  early_termination_requested: "action_required",
  support_information_required: "action_required",
  booking_cancelled: "important",
  refund_requires_attention: "important",
  handover_issue_reported: "important",
  extension_dates_unavailable: "important",
};

export function priorityFor(notification: Pick<Notification, "event_type" | "priority">): NotificationPriority {
  const stored = notification.priority as NotificationPriority | null;
  if (stored === "action_required" || stored === "important" || stored === "informational") {
    return stored;
  }
  return EVENT_PRIORITY[notification.event_type as NotificationEventType] ?? "informational";
}

export const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  informational: "Update",
  action_required: "Action needed",
  important: "Important",
};

export const PRIORITY_TONE: Record<NotificationPriority, "neutral" | "warning" | "danger"> = {
  informational: "neutral",
  action_required: "warning",
  important: "danger",
};

/* ------------------------------------------------------------ action paths */

/**
 * Notification links can only ever be internal application routes. Anything
 * that looks like an absolute URL, a protocol-relative URL or a scheme is
 * dropped rather than followed — a notification must never become an open
 * redirect. The database enforces the same rule on write.
 */
export function safeActionPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  if (path.includes("\\")) return null;
  // No scheme, no credentials, no control characters.
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  if (/[\u0000-\u001f\s]/.test(path)) return null;
  return path;
}

/* ---------------------------------------------------------------- read state */

export const isUnread = (n: Pick<Notification, "read_at" | "archived_at">): boolean =>
  n.read_at === null && n.archived_at === null;

export const unreadCount = (list: Pick<Notification, "read_at" | "archived_at">[]): number =>
  list.filter(isUnread).length;

/** Feed excludes archived items; history itself is never deleted. */
export const visibleFeed = <T extends Pick<Notification, "archived_at">>(list: T[]): T[] =>
  list.filter((n) => n.archived_at === null);

export const badgeCount = (count: number): string => (count > 99 ? "99+" : String(count));

export type FeedFilter = "all" | "unread" | "action";

export function applyFilter<T extends Pick<Notification, "read_at" | "archived_at" | "event_type" | "priority">>(
  list: T[],
  filter: FeedFilter,
): T[] {
  switch (filter) {
    case "unread":
      return list.filter(isUnread);
    case "action":
      return list.filter((n) => priorityFor(n) === "action_required");
    default:
      return list;
  }
}

/* ------------------------------------------------------------- empty states */

export type FeedState = "empty" | "all_caught_up" | "has_unread";

/**
 * "All caught up" is deliberately distinct from "nothing ever happened" — a
 * user with history but no unread items must not be told their feed is empty.
 */
export function feedState(list: Pick<Notification, "read_at" | "archived_at">[]): FeedState {
  if (list.length === 0) return "empty";
  return unreadCount(list) > 0 ? "has_unread" : "all_caught_up";
}

export const FEED_COPY: Record<FeedState, { title: string; body: string }> = {
  empty: {
    title: "No notifications yet",
    body: "Updates about your bookings, messages and support cases will appear here.",
  },
  all_caught_up: {
    title: "You're all caught up.",
    body: "Your earlier notifications are still here to look back on.",
  },
  has_unread: { title: "", body: "" },
};

/* ------------------------------------------------------------- dedupe keys */

/**
 * Mirrors the keys the database triggers generate. Kept here so tests can
 * assert the shape without a live database; the database index is the actual
 * guarantee that a retried webhook or a double-clicked button cannot create a
 * second identical notification.
 */
export function dedupeKey(event: string, ...parts: (string | null | undefined)[]): string {
  return [event, ...parts.filter((p): p is string => Boolean(p))].join(":");
}

/* -------------------------------------------------------------- pagination */

export interface PageRange {
  from: number;
  to: number;
}

export function pageRange(page: number, size: number = NOTIFICATION_PAGE_SIZE): PageRange {
  const safePage = Math.max(0, Math.floor(page));
  return { from: safePage * size, to: safePage * size + size - 1 };
}

export const hasMorePages = (received: number, size: number = NOTIFICATION_PAGE_SIZE): boolean =>
  received === size;

/* ------------------------------------------------------------- day grouping */

export type FeedGroupKey = "today" | "yesterday" | "earlier";

export interface FeedGroup<T> {
  key: FeedGroupKey;
  label: string;
  items: T[];
}

const GROUP_LABEL: Record<FeedGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupKeyFor(created: string, now: Date = new Date()): FeedGroupKey {
  const day = startOfDay(new Date(created));
  const today = startOfDay(now);
  if (day >= today) return "today";
  if (day >= today - 86_400_000) return "yesterday";
  return "earlier";
}

/**
 * Today / Yesterday / Earlier, in that order, with empty groups omitted.
 * Ordering inside a group is preserved — the feed is already newest first.
 */
export function groupByDay<T extends { created_at: string }>(
  list: T[],
  now: Date = new Date(),
): FeedGroup<T>[] {
  const buckets: Record<FeedGroupKey, T[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of list) buckets[groupKeyFor(item.created_at, now)].push(item);
  return (["today", "yesterday", "earlier"] as FeedGroupKey[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABEL[key], items: buckets[key] }));
}

/* ------------------------------------------------------------- preferences */

export const NOTIFICATION_CATEGORIES = [
  { value: "bookings", label: "Bookings", description: "Requests, acceptances, handovers and cancellations." },
  { value: "messages", label: "Messages", description: "New messages from a host or renter." },
  { value: "payments", label: "Payments", description: "Payments, payouts and refunds." },
  { value: "reviews", label: "Reviews", description: "Review invitations and published reviews." },
  { value: "announcements", label: "Announcements", description: "Occasional EarnRoom service updates." },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["value"];
export type NotificationChannel = "inapp" | "email";

export type NotificationPreferences = Tables<"notification_preferences">;

export const preferenceKey = (
  channel: NotificationChannel,
  category: NotificationCategory,
): keyof NotificationPreferences => `${channel}_${category}` as keyof NotificationPreferences;

export const DEFAULT_PREFERENCES: Record<string, boolean> = {
  inapp_bookings: true,
  inapp_messages: true,
  inapp_payments: true,
  inapp_reviews: true,
  inapp_announcements: true,
  email_bookings: true,
  email_messages: true,
  email_payments: true,
  email_reviews: false,
  email_announcements: false,
};

/**
 * Preferences shape delivery only. Anything that requires action — a payment,
 * a handover, a cancellation — is still recorded and still appears in the
 * notification centre and in "Needs your attention", whatever is switched off.
 */
export function preferenceValue(
  prefs: Partial<NotificationPreferences> | null | undefined,
  channel: NotificationChannel,
  category: NotificationCategory,
): boolean {
  const key = preferenceKey(channel, category) as string;
  const value = prefs ? (prefs as Record<string, unknown>)[key] : undefined;
  return typeof value === "boolean" ? value : (DEFAULT_PREFERENCES[key] ?? true);
}
