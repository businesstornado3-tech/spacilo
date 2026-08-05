/**
 * Reviews, ratings and reputation (Prompt 19) — pure domain rules.
 *
 * Nothing in here decides anything the server doesn't already decide. The
 * authority is `submit_booking_review` / `get_booking_review_state`, which run
 * under a row lock using server time. This module mirrors those rules so the
 * UI can explain itself, and formats reputation consistently everywhere.
 *
 * DOUBLE BLIND: a review the counterpart submitted is simply absent from the
 * payload until it is publishable. There is no "hidden" object to leak.
 */
import { brand } from "@/config/brand";

/** Canonical review period. Mirrors `stow_review_window_days()`. */
export const REVIEW_WINDOW_DAYS = 14;

export const MIN_REVIEW_TEXT = 10;
export const MAX_REVIEW_TEXT = 1000;

export type ReviewerRole = "renter" | "host";
export type ReviewModerationStatus = "visible" | "under_review" | "hidden";

export const RATING_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/** Renter sub-ratings. Informational only — overall stays canonical. */
export const SUBRATINGS = [
  { key: "accuracy", label: "Accuracy", hint: "Was the space as described?" },
  { key: "access", label: "Access", hint: "How easy was getting to your belongings?" },
  { key: "communication", label: "Communication", hint: "How was the host to deal with?" },
  { key: "condition", label: "Condition", hint: "What state was the space in?" },
] as const;

export type SubratingKey = (typeof SUBRATINGS)[number]["key"];

export interface BookingReview {
  id: string;
  booking_id: string;
  space_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: ReviewerRole;
  rating: number;
  review_text: string | null;
  rating_accuracy: number | null;
  rating_access: number | null;
  rating_communication: number | null;
  rating_condition: number | null;
  submitted_at: string;
  review_window_closes_at: string;
  published_at: string | null;
  moderation_status: ReviewModerationStatus;
}

/** What a participant may see about their own booking's reviews. */
export interface BookingReviewState {
  booking_id: string;
  viewer_role: ReviewerRole;
  server_time: string;
  booking_completed: boolean;
  completed_at: string | null;
  window_opens_at: string | null;
  window_closes_at: string;
  window_open: boolean;
  can_review: boolean;
  my_review: BookingReview | null;
  counterpart_review: PublicReview | null;
  counterpart_hidden_by_moderation: boolean;
  my_review_published: boolean;
}

/** Safe review shape shown publicly or to the counterpart. */
export interface PublicReview {
  id: string;
  rating: number;
  review_text: string | null;
  submitted_at: string;
  author_name: string;
  reviewer_role?: ReviewerRole;
  rating_accuracy: number | null;
  rating_access: number | null;
  rating_communication: number | null;
  rating_condition: number | null;
}

export interface ReviewSummary {
  review_count: number;
  /** null when there are no eligible reviews — never render this as 0.0. */
  average_rating: number | null;
  completed_bookings: number;
  distribution?: Record<"1" | "2" | "3" | "4" | "5", number>;
}

/* ------------------------------------------------------------- formatting */

/** One canonical rounding rule: one decimal place, half up. 4.84 → 4.8. */
export function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "4.8" — always one decimal so 5 never renders as a bare "5". */
export function formatRating(value: number): string {
  return roundRating(value).toFixed(1);
}

/**
 * Reputation line for a host, space or renter. A brand-new account shows
 * "New", never "0.0 (0 reviews)".
 */
export function reputationLabel(summary: Pick<ReviewSummary, "review_count" | "average_rating">): {
  isNew: boolean;
  rating: string | null;
  countLabel: string;
} {
  if (summary.review_count === 0 || summary.average_rating === null) {
    return { isNew: true, rating: null, countLabel: "No reviews yet" };
  }
  return {
    isNew: false,
    rating: formatRating(summary.average_rating),
    countLabel: `${summary.review_count} ${summary.review_count === 1 ? "review" : "reviews"}`,
  };
}

/** Completed bookings are counted separately — never inferred from reviews. */
export function completedBookingsLabel(count: number): string {
  return `${count} completed ${count === 1 ? "booking" : "bookings"}`;
}

/** Public reviews show the month only, never an exact timestamp. */
export function formatReviewMonth(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(brand.locale, { month: "long", year: "numeric" }).format(value);
}

/* ----------------------------------------------------------- review window */

/** Mirrors the server: window opens at canonical completion, not the end date. */
export function reviewWindowClosesAt(completedAt: string | Date): Date {
  const start = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  return new Date(start.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Whole days remaining, floored at 0. Display only — the server decides. */
export function daysLeftToReview(closesAt: string | Date, now: Date = new Date()): number {
  const end = typeof closesAt === "string" ? new Date(closesAt) : closesAt;
  const ms = end.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function reviewWindowLabel(closesAt: string | Date, now: Date = new Date()): string {
  const days = daysLeftToReview(closesAt, now);
  if (days === 0) return "Review period ended";
  if (days === 1) return "1 day left to review";
  return `${days} days left to review`;
}

/* -------------------------------------------------------------- panel state */

export type ReviewPanelState =
  | "not_completed"
  | "eligible"
  | "submitted_pending"
  | "published"
  | "window_closed_unreviewed"
  | "moderated";

/**
 * Which of the five completed-booking presentations applies. Derived only
 * from the server payload, so the browser clock can never open a closed
 * window or reveal an unpublished review.
 */
export function reviewPanelState(state: BookingReviewState | null | undefined): ReviewPanelState {
  if (!state || !state.booking_completed) return "not_completed";
  if (state.my_review && state.my_review.moderation_status === "hidden") return "moderated";
  if (state.my_review) return state.my_review_published ? "published" : "submitted_pending";
  if (state.can_review) return "eligible";
  return "window_closed_unreviewed";
}

export const REVIEW_PANEL_COPY: Record<
  ReviewPanelState,
  { title: string; renter: string; host: string }
> = {
  not_completed: {
    title: "Reviews open when the booking finishes",
    renter: "You can review your host once collection is confirmed by both of you.",
    host: "You can review the renter once collection is confirmed by both of you.",
  },
  eligible: {
    title: "How was your storage experience?",
    renter: "Your feedback helps other people choose storage with confidence.",
    host: "Your feedback helps build trust between hosts and renters.",
  },
  submitted_pending: {
    title: "Review submitted",
    renter:
      "Your review will be shared when the other person submits theirs or when the review period ends.",
    host: "Your review will be shared when the other person submits theirs or when the review period ends.",
  },
  published: {
    title: "Reviews",
    renter: "Both reviews are now visible.",
    host: "Both reviews are now visible.",
  },
  window_closed_unreviewed: {
    title: "Review period ended",
    renter: "The 14-day review period for this booking has closed.",
    host: "The 14-day review period for this booking has closed.",
  },
  moderated: {
    title: "Review unavailable",
    renter: "This review is not currently shown while our support team looks at it.",
    host: "This review is not currently shown while our support team looks at it.",
  },
};

export function reviewPanelCopy(state: ReviewPanelState, audience: ReviewerRole) {
  const copy = REVIEW_PANEL_COPY[state];
  return { title: copy.title, body: audience === "renter" ? copy.renter : copy.host };
}

/**
 * Dashboard prompt for "Needs your attention". Returns null unless this person
 * still has a review to leave inside an open window.
 */
export function reviewActionPrompt(
  state: BookingReviewState | null | undefined,
  audience: ReviewerRole,
): string | null {
  if (reviewPanelState(state) !== "eligible") return null;
  return audience === "renter"
    ? "Leave a review for your storage stay."
    : "Review your completed booking.";
}

/* --------------------------------------------------------------- validation */

export interface ReviewDraft {
  rating: number | null;
  text: string;
  subratings?: Partial<Record<SubratingKey, number | null>>;
}

/** Client-side mirror of the server checks. The server still re-validates. */
export function validateReviewDraft(draft: ReviewDraft): string | null {
  if (draft.rating === null) return "Choose an overall rating from 1 to 5 stars.";
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) {
    return "Choose an overall rating from 1 to 5 stars.";
  }
  const text = normaliseReviewText(draft.text);
  if (text !== null && text.length < MIN_REVIEW_TEXT) {
    return `Write at least ${MIN_REVIEW_TEXT} characters, or leave the box empty.`;
  }
  if (text !== null && text.length > MAX_REVIEW_TEXT) {
    return `Keep your review under ${MAX_REVIEW_TEXT} characters.`;
  }
  for (const value of Object.values(draft.subratings ?? {})) {
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < 1 || value > 5) return "Sub-ratings must be 1 to 5.";
  }
  return null;
}

/** Collapses runs of whitespace; empty becomes null (rating-only review). */
export function normaliseReviewText(text: string | null | undefined): string | null {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value === "" ? null : value;
}

/* ------------------------------------------------------------- moderation */

export const REPORT_REASONS = [
  { value: "personal_information", label: "Personal information" },
  { value: "abusive", label: "Abusive or threatening content" },
  { value: "discriminatory", label: "Discriminatory content" },
  { value: "unrelated", label: "Unrelated to the booking" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const MODERATION_STATUS_LABEL: Record<ReviewModerationStatus, string> = {
  visible: "Visible",
  under_review: "Flagged for review",
  hidden: "Hidden",
};

/** Only hidden reviews are suppressed. Flagging alone never removes content. */
export function contributesToAggregate(review: {
  moderation_status: ReviewModerationStatus;
  published: boolean;
}): boolean {
  return review.published && review.moderation_status !== "hidden";
}

/** User-safe copy for the review RPCs. Never leaks SQL detail. */
export const REVIEW_ERRORS: Record<string, string> = {
  not_authenticated: "You need to be signed in to do that.",
  booking_not_found: "That booking could not be found.",
  not_a_booking_participant: "You can only review your own bookings.",
  booking_not_completed: "You can review once the booking has finished.",
  review_window_closed: "The review period for this booking has ended.",
  rating_invalid: "Choose an overall rating from 1 to 5 stars.",
  review_text_too_short: "Write at least 10 characters, or leave the box empty.",
  review_text_too_long: "Keep your review under 1000 characters.",
  review_not_found: "That review could not be found.",
  review_not_visible: "That review isn't available to you yet.",
  not_support_staff: "You don't have permission to do that.",
  moderation_reason_required: "Add a reason before hiding a review.",
  moderation_action_invalid: "That moderation action isn't allowed.",
};

export function friendlyReviewError(message: string, fallback: string): string {
  for (const [key, text] of Object.entries(REVIEW_ERRORS)) {
    if (message.includes(key)) return text;
  }
  return fallback;
}
