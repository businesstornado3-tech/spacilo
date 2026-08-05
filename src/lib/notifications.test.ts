import { describe, expect, it } from "vitest";

import {
  applyFilter,
  badgeCount,
  dedupeKey,
  eventLabel,
  FEED_COPY,
  feedState,
  hasMorePages,
  isUnread,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_PAGE_SIZE,
  pageRange,
  priorityFor,
  PRIORITY_LABEL,
  safeActionPath,
  unreadCount,
  visibleFeed,
  type Notification,
} from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/format";

const base = (over: Partial<Notification> = {}): Notification =>
  ({
    id: "n1",
    recipient_user_id: "user-1",
    event_type: "booking_payment_confirmed",
    title: "Payment confirmed",
    body: "Your booking is confirmed.",
    entity_type: "booking",
    entity_id: "b1",
    booking_id: "b1",
    action_path: "/renter/bookings/b1",
    priority: "informational",
    dedupe_key: "booking_payment_confirmed:b1:renter",
    metadata: {},
    created_at: new Date().toISOString(),
    read_at: null,
    archived_at: null,
    ...over,
  }) as Notification;

/* ------------------------------------------------- 1. event label mapping */

describe("event labels", () => {
  it("gives every known event type a human label", () => {
    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(eventLabel(type)).toBeTruthy();
      expect(eventLabel(type)).not.toBe("Update");
    }
  });

  it("falls back safely for an unknown event type", () => {
    expect(eventLabel("something_new")).toBe("Update");
  });
});

/* ------------------------------------------------------ 2. priority model */

describe("priority", () => {
  it("uses the stored priority when present", () => {
    expect(priorityFor(base({ priority: "important" }))).toBe("important");
    expect(priorityFor(base({ priority: "action_required" }))).toBe("action_required");
  });

  it("derives a sensible priority when the stored value is missing", () => {
    expect(
      priorityFor({ event_type: "booking_payment_required", priority: null } as never),
    ).toBe("action_required");
    expect(priorityFor({ event_type: "refund_requires_attention", priority: null } as never)).toBe(
      "important",
    );
    expect(priorityFor({ event_type: "storage_started", priority: null } as never)).toBe(
      "informational",
    );
  });

  it("only exposes three presentation levels", () => {
    expect(Object.keys(PRIORITY_LABEL).sort()).toEqual([
      "action_required",
      "important",
      "informational",
    ]);
  });
});

/* ----------------------------------------- 3. safe action route generation */

describe("safeActionPath", () => {
  it("keeps internal application routes", () => {
    expect(safeActionPath("/renter/bookings/abc")).toBe("/renter/bookings/abc");
    expect(safeActionPath("/host/requests/abc?tab=1")).toBe("/host/requests/abc?tab=1");
  });

  it("rejects external and protocol-relative URLs — no open redirects", () => {
    expect(safeActionPath("https://malicious-site.example")).toBeNull();
    expect(safeActionPath("//malicious-site.example/steal")).toBeNull();
    expect(safeActionPath("javascript:alert(1)")).toBeNull();
    expect(safeActionPath("/\\malicious-site.example")).toBeNull();
    expect(safeActionPath("/javascript:alert(1)")).toBeNull();
    expect(safeActionPath("renter/bookings")).toBeNull();
    expect(safeActionPath(null)).toBeNull();
  });
});

/* ------------------------------------------ 4-7. read + empty presentation */

describe("read state presentation", () => {
  it("marks a notification unread only when it is neither read nor archived", () => {
    expect(isUnread(base())).toBe(true);
    expect(isUnread(base({ read_at: new Date().toISOString() }))).toBe(false);
    expect(isUnread(base({ archived_at: new Date().toISOString() }))).toBe(false);
  });

  it("counts unread items", () => {
    expect(unreadCount([base(), base({ read_at: "2026-01-01T00:00:00Z" }), base()])).toBe(2);
  });

  it("hides archived items from the feed without deleting history", () => {
    const list = [base(), base({ id: "n2", archived_at: "2026-01-01T00:00:00Z" })];
    expect(visibleFeed(list)).toHaveLength(1);
    expect(list).toHaveLength(2);
  });

  it("shows the empty state only when there is no history at all", () => {
    expect(feedState([])).toBe("empty");
    expect(FEED_COPY.empty.title).toBe("No notifications yet");
  });

  it("says all caught up when history exists but nothing is unread", () => {
    expect(feedState([base({ read_at: "2026-01-01T00:00:00Z" })])).toBe("all_caught_up");
    expect(FEED_COPY.all_caught_up.title).toBe("You're all caught up.");
  });

  it("reports unread state when something is waiting", () => {
    expect(feedState([base()])).toBe("has_unread");
  });

  it("filters the feed", () => {
    const list = [
      base({ id: "a" }),
      base({ id: "b", read_at: "2026-01-01T00:00:00Z" }),
      base({ id: "c", priority: "action_required", event_type: "booking_payment_required" }),
    ];
    expect(applyFilter(list, "all")).toHaveLength(3);
    expect(applyFilter(list, "unread").map((n) => n.id)).toEqual(["a", "c"]);
    expect(applyFilter(list, "action").map((n) => n.id)).toEqual(["c"]);
  });
});

/* --------------------------------------------------- 8. unread badge count */

describe("badge count", () => {
  it("caps at 99+", () => {
    expect(badgeCount(0)).toBe("0");
    expect(badgeCount(3)).toBe("3");
    expect(badgeCount(99)).toBe("99");
    expect(badgeCount(140)).toBe("99+");
  });
});

/* --------------------------------------------------------- 9. pagination */

describe("pagination", () => {
  it("pages 20 at a time, newest first", () => {
    expect(NOTIFICATION_PAGE_SIZE).toBe(20);
    expect(pageRange(0)).toEqual({ from: 0, to: 19 });
    expect(pageRange(1)).toEqual({ from: 20, to: 39 });
    expect(pageRange(-3)).toEqual({ from: 0, to: 19 });
  });

  it("stops requesting pages once a short page comes back", () => {
    expect(hasMorePages(20)).toBe(true);
    expect(hasMorePages(7)).toBe(false);
    expect(hasMorePages(0)).toBe(false);
  });
});

/* ------------------------------------------------ 10. dedupe key generation */

describe("dedupe keys", () => {
  it("builds a stable key per domain event", () => {
    expect(dedupeKey("booking_payment_confirmed", "b1", "renter")).toBe(
      "booking_payment_confirmed:b1:renter",
    );
    expect(dedupeKey("refund_completed", "r1")).toBe("refund_completed:r1");
    expect(dedupeKey("review_available", "b1", "u1")).toBe("review_available:b1:u1");
    expect(dedupeKey("extension_confirmed", "cr1", null, "renter")).toBe(
      "extension_confirmed:cr1:renter",
    );
  });

  it("gives the two sides of a booking distinct keys", () => {
    expect(dedupeKey("storage_started", "b1", "renter")).not.toBe(
      dedupeKey("storage_started", "b1", "host"),
    );
  });

  it("gives repeated deliveries of the same event an identical key", () => {
    const first = dedupeKey("booking_completed", "b1", "renter");
    const retry = dedupeKey("booking_completed", "b1", "renter");
    expect(first).toBe(retry);
  });
});

/* --------------------------------------------- 11. domain event coverage */

describe("domain event coverage", () => {
  const required = [
    "booking_request_received",
    "booking_request_accepted",
    "booking_payment_required",
    "booking_payment_confirmed",
    "booking_payment_failed",
    "handover_confirmation_required",
    "handover_confirmed_by_other_party",
    "storage_started",
    "collection_confirmation_required",
    "collection_confirmed_by_other_party",
    "booking_completed",
    "handover_issue_reported",
    "new_booking_message",
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
  ];

  it("declares every lifecycle event the marketplace can raise", () => {
    for (const type of required) {
      expect(NOTIFICATION_EVENT_TYPES).toContain(type);
    }
  });

  it("treats renter-facing money problems as at least important", () => {
    for (const type of ["refund_requires_attention", "extension_dates_unavailable"]) {
      expect(priorityFor({ event_type: type, priority: null } as never)).toBe("important");
    }
  });

  it("never announces a review submission — only availability and publication", () => {
    const reviewEvents = NOTIFICATION_EVENT_TYPES.filter((t) => t.startsWith("review"));
    expect(reviewEvents).toEqual(["review_available", "review_published", "review_report_update"]);
    expect(reviewEvents).not.toContain("review_submitted");
    expect(reviewEvents).not.toContain("review_received");
  });
});

/* ----------------------------------------------------- 12. time formatting */

describe("relative time", () => {
  const now = new Date("2026-03-12T12:00:00Z");
  it("uses one shared formatter", () => {
    expect(formatRelativeTime("2026-03-12T11:59:40Z", now)).toBe("Just now");
    expect(formatRelativeTime("2026-03-12T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelativeTime("2026-03-12T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-03-11T09:00:00Z", now)).toBe("Yesterday");
    expect(formatRelativeTime("2026-03-09T09:00:00Z", now)).toBe("3 days ago");
    expect(formatRelativeTime("2026-01-09T09:00:00Z", now)).toBe("9 January 2026");
  });
});
