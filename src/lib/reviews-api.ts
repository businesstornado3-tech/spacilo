/**
 * Data access for reviews (Prompt 19).
 *
 * Every write goes through a SECURITY DEFINER RPC that derives the reviewer,
 * the reviewee and the review window from the booking under a row lock. This
 * module never inserts, updates or deletes a review row directly, and never
 * asks the database for a counterpart review that hasn't been published.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  BookingReview,
  BookingReviewState,
  PublicReview,
  ReportReason,
  ReviewSummary,
  SubratingKey,
} from "@/lib/reviews";
import { friendlyReviewError, normaliseReviewText } from "@/lib/reviews";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_SUMMARY: ReviewSummary = {
  review_count: 0,
  average_rating: null,
  completed_bookings: 0,
};

function asSummary(value: unknown): ReviewSummary {
  if (!value || typeof value !== "object") return EMPTY_SUMMARY;
  const row = value as Record<string, unknown>;
  const average = row["average_rating"];
  return {
    review_count: Number(row["review_count"] ?? 0),
    average_rating: average === null || average === undefined ? null : Number(average),
    completed_bookings: Number(row["completed_bookings"] ?? 0),
    ...(row["distribution"] ? { distribution: row["distribution"] as ReviewSummary["distribution"] } : {}),
  };
}

/* ------------------------------------------------------------ participants */

/** Server-authoritative eligibility, window dates and publishable reviews. */
export async function getBookingReviewState(bookingId: string): Promise<BookingReviewState | null> {
  const { data, error } = await supabase.rpc("get_booking_review_state", {
    p_booking_id: bookingId,
  });
  if (error) {
    // A non-participant simply has no review state to show.
    if (error.message.includes("not_a_booking_participant")) return null;
    throw new Error(friendlyReviewError(error.message, "We couldn't load the reviews."));
  }
  return (data as unknown as BookingReviewState) ?? null;
}

export interface SubmitReviewInput {
  bookingId: string;
  rating: number;
  text?: string | null;
  subratings?: Partial<Record<SubratingKey, number | null>>;
}

/**
 * Idempotent: a repeated call (double-click, retry, refresh) returns the
 * review that already exists instead of creating a second one.
 */
export async function submitBookingReview(input: SubmitReviewInput): Promise<BookingReview> {
  const sub = input.subratings ?? {};
  const { data, error } = await supabase.rpc("submit_booking_review", {
    p_booking_id: input.bookingId,
    p_rating: input.rating,
    p_review_text: normaliseReviewText(input.text),
    p_accuracy: sub.accuracy ?? null,
    p_access: sub.access ?? null,
    p_communication: sub.communication ?? null,
    p_condition: sub.condition ?? null,
  });
  if (error) {
    throw new Error(friendlyReviewError(error.message, "We couldn't save your review."));
  }
  return data as unknown as BookingReview;
}

/** Reporting never hides a review — it only raises a moderation signal. */
export async function reportBookingReview(input: {
  reviewId: string;
  reason: ReportReason;
  details?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("report_booking_review", {
    p_review_id: input.reviewId,
    p_reason: input.reason,
    p_details: normaliseReviewText(input.details),
  });
  if (error) {
    throw new Error(friendlyReviewError(error.message, "We couldn't send that report."));
  }
}

/* ----------------------------------------------------------------- public */

export async function listSpaceReviews(
  spaceId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PublicReview[]> {
  if (!UUID_RE.test(spaceId)) return [];
  const { data, error } = await supabase.rpc("get_space_reviews", {
    p_space_id: spaceId,
    p_limit: opts.limit ?? 10,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as unknown as PublicReview[];
}

export async function getSpaceReviewSummary(spaceId: string): Promise<ReviewSummary> {
  if (!UUID_RE.test(spaceId)) return EMPTY_SUMMARY;
  const { data, error } = await supabase.rpc("get_space_review_summary", { p_space_id: spaceId });
  if (error) throw error;
  return asSummary(data);
}

export async function getHostReputation(hostId: string): Promise<ReviewSummary> {
  if (!UUID_RE.test(hostId)) return EMPTY_SUMMARY;
  const { data, error } = await supabase.rpc("get_host_reputation", { p_host_id: hostId });
  if (error) throw error;
  return asSummary(data);
}

/** Signed-in surfaces only — renter reputation is never granted to anon. */
export async function getRenterReputation(renterId: string): Promise<ReviewSummary> {
  if (!UUID_RE.test(renterId)) return EMPTY_SUMMARY;
  const { data, error } = await supabase.rpc("get_renter_reputation", { p_renter_id: renterId });
  if (error) throw error;
  return asSummary(data);
}

/* ------------------------------------------------------------- moderation */

export interface ReportedReview {
  id: string;
  booking_id: string;
  space_id: string;
  reviewer_role: "renter" | "host";
  rating: number;
  review_text: string | null;
  submitted_at: string;
  moderation_status: "visible" | "under_review" | "hidden";
  moderation_reason: string | null;
  moderated_at: string | null;
  report_count: number;
  last_reported_at: string;
  reports: { reason: string; details: string | null; status: string; created_at: string }[];
}

export async function listReportedReviews(): Promise<ReportedReview[]> {
  const { data, error } = await supabase.rpc("list_reported_reviews", { p_limit: 100 });
  if (error) {
    throw new Error(friendlyReviewError(error.message, "We couldn't load the moderation queue."));
  }
  return (data as unknown as ReportedReview[]) ?? [];
}

/** Hide or restore only. Original rating and wording are never editable. */
export async function moderateBookingReview(input: {
  reviewId: string;
  action: "hide" | "restore" | "flag";
  reason?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("moderate_booking_review", {
    p_review_id: input.reviewId,
    p_action: input.action,
    p_reason: normaliseReviewText(input.reason),
  });
  if (error) {
    throw new Error(friendlyReviewError(error.message, "We couldn't apply that moderation."));
  }
}
