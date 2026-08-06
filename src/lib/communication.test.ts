/**
 * Prompt 26B — communication layer rules.
 *
 * These tests pin the promises the UI makes: server-owned unread counts,
 * privacy wording that never leaks an address, availability that indicates
 * rather than guarantees, and host facts that stay facts.
 */
import { describe, expect, it } from "vitest";

import {
  addressVisibility,
  conversationTitle,
  inboxBadge,
  isEnquiryThread,
  isValidReportReason,
  previewText,
  searchConversations,
  sortByLatest,
  totalUnread,
  type ConversationSummary,
} from "@/lib/messages";
import {
  availabilitySummary,
  monthGrid,
  nextAvailableDay,
  overlapsUnavailable,
  reasonLabel,
} from "@/lib/marketplace/availability";
import { hostProfileView, responseTimeLabel } from "@/lib/trust/host-profile";
import { groupByDay, groupKeyFor, preferenceValue } from "@/lib/notifications";

const row = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: "c1",
  booking_id: "b1",
  space_id: "s1",
  space_title: "Dry single garage, Southsea",
  cover_path: null,
  counterpart_name: "Priya",
  counterpart_role: "host",
  booking_status: "confirmed",
  last_message_at: "2026-02-01T10:00:00.000Z",
  last_message_preview: "Happy to meet Saturday morning if that suits.",
  unread_count: 0,
  archived: false,
  moderation_status: "visible",
  ...over,
});

describe("inbox presentation", () => {
  it("titles a booking thread from the listing and an enquiry without one", () => {
    expect(conversationTitle(row())).toBe("Dry single garage, Southsea");
    expect(conversationTitle(row({ booking_id: null, space_title: null }))).toBe(
      "Question about a space",
    );
    expect(isEnquiryThread(row({ booking_id: null }))).toBe(true);
  });

  it("orders by latest activity and pushes silent threads last", () => {
    const ordered = sortByLatest([
      row({ id: "a", last_message_at: null }),
      row({ id: "b", last_message_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "c", last_message_at: "2026-03-01T00:00:00.000Z" }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("searches names, listings and message text", () => {
    const rows = [row(), row({
      id: "c2",
      counterpart_name: "Tom",
      space_title: "Loft, Fratton",
      last_message_preview: "Is Sunday any good?",
    })];
    expect(searchConversations(rows, "fratton").map((r) => r.id)).toEqual(["c2"]);
    expect(searchConversations(rows, "saturday").map((r) => r.id)).toEqual(["c1"]);
    expect(searchConversations(rows, "  ")).toHaveLength(2);
  });

  it("sums unread from the server counts and caps the badge", () => {
    expect(totalUnread([row({ unread_count: 2 }), row({ unread_count: 3 })])).toBe(5);
    expect(inboxBadge(4)).toBe("4");
    expect(inboxBadge(140)).toBe("99+");
  });

  it("truncates previews and never invents one", () => {
    expect(previewText(row({ last_message_preview: null }))).toBe("No messages yet");
    const long = previewText(row({ last_message_preview: "x".repeat(200) }));
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith("…")).toBe(true);
  });

  it("only accepts known report reasons", () => {
    expect(isValidReportReason("spam")).toBe(true);
    expect(isValidReportReason("because-i-said-so")).toBe(false);
  });

  it("keeps the address hidden until a booking is real", () => {
    expect(addressVisibility(null)).toBe("before");
    expect(addressVisibility("pending_payment")).toBe("before");
    expect(addressVisibility("confirmed")).toBe("after");
    expect(addressVisibility("active")).toBe("after");
  });
});

describe("notification feed grouping and preferences", () => {
  const now = new Date("2026-02-10T09:00:00.000Z");

  it("buckets by today, yesterday and earlier", () => {
    expect(groupKeyFor("2026-02-10T01:00:00.000Z", now)).toBe("today");
    expect(groupKeyFor("2026-02-09T23:00:00.000Z", now)).toBe("yesterday");
    expect(groupKeyFor("2026-01-30T10:00:00.000Z", now)).toBe("earlier");
  });

  it("omits empty groups and keeps feed order", () => {
    const groups = groupByDay(
      [
        { created_at: "2026-02-10T08:00:00.000Z", id: "a" },
        { created_at: "2026-02-10T07:00:00.000Z", id: "b" },
        { created_at: "2026-01-01T07:00:00.000Z", id: "c" },
      ],
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "earlier"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("falls back to defaults when a preference row is missing", () => {
    expect(preferenceValue(null, "inapp", "bookings")).toBe(true);
    expect(preferenceValue(null, "email", "reviews")).toBe(false);
    expect(preferenceValue({ email_reviews: true } as never, "email", "reviews")).toBe(true);
  });
});

describe("availability", () => {
  const ranges = [
    { start_date: "2026-03-01", end_date: "2026-03-10", reason: "booked" },
    { start_date: "2026-04-01", end_date: "2026-04-02", reason: "after_availability" },
  ];

  it("labels every reason in plain words", () => {
    expect(reasonLabel("booked")).toBe("Booked");
    expect(reasonLabel("mystery")).toBe("Unavailable");
  });

  it("detects any overlap with a requested stay", () => {
    expect(overlapsUnavailable("2026-02-25", "2026-03-02", ranges)).toBe(true);
    expect(overlapsUnavailable("2026-03-11", "2026-03-20", ranges)).toBe(false);
  });

  it("finds the next open day and bounds the search", () => {
    expect(nextAvailableDay(ranges, "2026-03-05")).toBe("2026-03-11");
    expect(
      nextAvailableDay(
        [{ start_date: "2026-01-01", end_date: "2030-01-01", reason: "booked" }],
        "2026-03-05",
      ),
    ).toBeNull();
  });

  it("never promises a reservation", () => {
    const summary = availabilitySummary(ranges, "2026-02-01");
    expect(summary.toLowerCase()).not.toContain("guarantee");
    expect(availabilitySummary(ranges, "2026-03-05")).toContain("Estimated next available");
  });

  it("pads a month to Monday-first alignment", () => {
    const cells = monthGrid(2026, 2, ranges, "2026-03-05"); // March 2026 starts Sunday
    expect(cells.slice(0, 6).every((cell) => cell.date === null)).toBe(true);
    expect(cells.filter((cell) => cell.date).length).toBe(31);
    expect(cells.find((cell) => cell.date === "2026-03-03")?.unavailable).toBe(true);
  });
});

describe("host trust profile", () => {
  it("publishes reply stats only once the sample is big enough", () => {
    expect(responseTimeLabel({ sample_size: 2, median_response_hours: 1 })).toBeNull();
    expect(responseTimeLabel({ sample_size: 8, median_response_hours: 0.4 })).toBe(
      "Usually replies within the hour",
    );
    expect(responseTimeLabel({ sample_size: 8, median_response_hours: 50 })).toContain("2 days");
  });

  it("states facts without claiming safety", () => {
    const view = hostProfileView({
      first_name: "Priya",
      joined_at: "2025-06-02T00:00:00.000Z",
      phone_verified: true,
      listings_count: 1,
      reputation: { review_count: 4, average_rating: 4.75, completed_bookings: 3 },
      response_stats: { sample_size: 6, responded_count: 6, median_response_hours: 2 },
    });
    expect(view.ratingLabel).toBe("4.8");
    expect(view.listingsLabel).toBe("1 published listing");
    expect(view.responseRateLabel).toBe("100% of requests answered");
    expect(view.joinedLabel).toContain("2025");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("guaranteed");
  });

  it("degrades gracefully for a brand new host", () => {
    const view = hostProfileView(null);
    expect(view.firstName).toBe("Your host");
    expect(view.reviewsLabel).toBe("No reviews yet");
    expect(view.responseRateLabel).toBeNull();
    expect(view.completedLabel).toBe("No completed bookings yet");
  });
});
