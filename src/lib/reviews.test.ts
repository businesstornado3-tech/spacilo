/**
 * Reviews domain rules. These lock down the parts a UI change could quietly
 * break: the double-blind presentation, "New" instead of 0.0, and the fact
 * that eligibility comes from the server payload, not the browser clock.
 */
import { describe, expect, it } from "vitest";

import {
  REVIEW_WINDOW_DAYS,
  completedBookingsLabel,
  contributesToAggregate,
  daysLeftToReview,
  formatRating,
  normaliseReviewText,
  reputationLabel,
  reviewActionPrompt,
  reviewPanelState,
  reviewWindowClosesAt,
  reviewWindowLabel,
  roundRating,
  validateReviewDraft,
  type BookingReview,
  type BookingReviewState,
} from "@/lib/reviews";

const COMPLETED = "2026-01-01T12:00:00.000Z";

function review(overrides: Partial<BookingReview> = {}): BookingReview {
  return {
    id: "r1",
    booking_id: "b1",
    space_id: "s1",
    reviewer_id: "u1",
    reviewee_id: "u2",
    reviewer_role: "renter",
    rating: 5,
    review_text: "Great space, easy access.",
    rating_accuracy: null,
    rating_access: null,
    rating_communication: null,
    rating_condition: null,
    submitted_at: COMPLETED,
    review_window_closes_at: "2026-01-15T12:00:00.000Z",
    published_at: null,
    moderation_status: "visible",
    ...overrides,
  };
}

function state(overrides: Partial<BookingReviewState> = {}): BookingReviewState {
  return {
    booking_id: "b1",
    viewer_role: "renter",
    server_time: "2026-01-02T12:00:00.000Z",
    booking_completed: true,
    completed_at: COMPLETED,
    window_opens_at: COMPLETED,
    window_closes_at: "2026-01-15T12:00:00.000Z",
    window_open: true,
    can_review: true,
    my_review: null,
    counterpart_review: null,
    counterpart_hidden_by_moderation: false,
    my_review_published: false,
    ...overrides,
  };
}

describe("rating formatting", () => {
  it("rounds to one decimal place, half up", () => {
    expect(roundRating(4.84)).toBe(4.8);
    expect(roundRating(4.85)).toBe(4.9);
  });

  it("always shows a decimal so 5 is not a bare integer", () => {
    expect(formatRating(5)).toBe("5.0");
    expect(formatRating(4.25)).toBe("4.3");
  });
});

describe("reputation label", () => {
  it("shows New rather than 0.0 for an account with no reviews", () => {
    const label = reputationLabel({ review_count: 0, average_rating: null });
    expect(label.isNew).toBe(true);
    expect(label.rating).toBeNull();
    expect(label.countLabel).toBe("No reviews yet");
  });

  it("never renders an average when the count is zero", () => {
    expect(reputationLabel({ review_count: 0, average_rating: 4.9 }).isNew).toBe(true);
  });

  it("pluralises reviews correctly", () => {
    expect(reputationLabel({ review_count: 1, average_rating: 5 }).countLabel).toBe("1 review");
    expect(reputationLabel({ review_count: 7, average_rating: 4.2 }).countLabel).toBe("7 reviews");
  });

  it("counts completed bookings separately from reviews", () => {
    expect(completedBookingsLabel(1)).toBe("1 completed booking");
    expect(completedBookingsLabel(4)).toBe("4 completed bookings");
  });
});

describe("review window", () => {
  it("runs 14 days from completion", () => {
    expect(REVIEW_WINDOW_DAYS).toBe(14);
    expect(reviewWindowClosesAt(COMPLETED).toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("floors remaining days at zero once closed", () => {
    expect(daysLeftToReview("2026-01-15T12:00:00.000Z", new Date("2026-01-20T00:00:00Z"))).toBe(0);
    expect(reviewWindowLabel("2026-01-15T12:00:00.000Z", new Date("2026-01-20T00:00:00Z"))).toBe(
      "Review period ended",
    );
  });

  it("uses singular wording on the final day", () => {
    expect(reviewWindowLabel("2026-01-15T12:00:00.000Z", new Date("2026-01-14T18:00:00Z"))).toBe(
      "1 day left to review",
    );
  });
});

describe("panel state (double blind)", () => {
  it("shows nothing before the booking is completed", () => {
    expect(reviewPanelState(state({ booking_completed: false }))).toBe("not_completed");
    expect(reviewPanelState(null)).toBe("not_completed");
  });

  it("invites a review while the window is open", () => {
    expect(reviewPanelState(state())).toBe("eligible");
  });

  it("holds a submitted review back until it is published", () => {
    expect(reviewPanelState(state({ my_review: review(), my_review_published: false }))).toBe(
      "submitted_pending",
    );
  });

  it("reveals both reviews once published", () => {
    expect(reviewPanelState(state({ my_review: review(), my_review_published: true }))).toBe(
      "published",
    );
  });

  it("cannot be reopened by a stale browser clock", () => {
    // Server says the window is closed; only that matters.
    expect(reviewPanelState(state({ can_review: false }))).toBe("window_closed_unreviewed");
  });

  it("marks a hidden review as moderated", () => {
    expect(
      reviewPanelState(
        state({ my_review: review({ moderation_status: "hidden" }), my_review_published: true }),
      ),
    ).toBe("moderated");
  });
});

describe("dashboard prompt", () => {
  it("prompts only while a review is still owed", () => {
    expect(reviewActionPrompt(state(), "renter")).toBe("Leave a review for your storage stay.");
    expect(reviewActionPrompt(state(), "host")).toBe("Review your completed booking.");
  });

  it("stops prompting once submitted or closed", () => {
    expect(reviewActionPrompt(state({ my_review: review() }), "renter")).toBeNull();
    expect(reviewActionPrompt(state({ can_review: false }), "renter")).toBeNull();
  });
});

describe("draft validation", () => {
  it("requires an overall rating", () => {
    expect(validateReviewDraft({ rating: null, text: "" })).toMatch(/overall rating/);
  });

  it("allows a rating-only review", () => {
    expect(validateReviewDraft({ rating: 4, text: "   " })).toBeNull();
  });

  it("rejects a token-length written review", () => {
    expect(validateReviewDraft({ rating: 4, text: "ok" })).toMatch(/at least 10/);
  });

  it("rejects out-of-range sub-ratings", () => {
    expect(validateReviewDraft({ rating: 4, text: "", subratings: { access: 9 } })).toMatch(
      /1 to 5/,
    );
  });

  it("ignores unset sub-ratings", () => {
    expect(
      validateReviewDraft({ rating: 4, text: "", subratings: { access: null } }),
    ).toBeNull();
  });

  it("treats whitespace-only text as no text at all", () => {
    expect(normaliseReviewText("  \n ")).toBeNull();
    expect(normaliseReviewText("great   space")).toBe("great space");
  });
});

describe("aggregates", () => {
  it("excludes hidden reviews from averages", () => {
    expect(contributesToAggregate({ moderation_status: "hidden", published: true })).toBe(false);
  });

  it("keeps flagged-but-visible reviews counted", () => {
    expect(contributesToAggregate({ moderation_status: "under_review", published: true })).toBe(
      true,
    );
  });

  it("excludes unpublished reviews", () => {
    expect(contributesToAggregate({ moderation_status: "visible", published: false })).toBe(false);
  });
});
