/**
 * The review panel on a completed booking, for either side.
 *
 * Everything shown here comes from `get_booking_review_state`, which decides
 * eligibility on server time and simply omits a counterpart review that isn't
 * publishable yet. Deliberately, we do not tell you whether the other person
 * has reviewed until your own review is in — that's the double-blind rule.
 */
import * as React from "react";
import { Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { StarRatingDisplay } from "@/components/reviews/StarRatingInput";
import { useBookingReviewState } from "@/hooks/useReviews";
import { formatDate } from "@/lib/format";
import {
  reviewPanelCopy,
  reviewPanelState,
  reviewWindowLabel,
  type PublicReview,
  type ReviewerRole,
} from "@/lib/reviews";

export function BookingReviewSection({
  bookingId,
  audience,
}: {
  bookingId: string;
  audience: ReviewerRole;
}) {
  const { data: state, isLoading } = useBookingReviewState(bookingId);
  const [writing, setWriting] = React.useState(false);

  const panel = reviewPanelState(state);
  if (panel === "not_completed") return null;

  const copy = reviewPanelCopy(panel, audience);
  const mine = state?.my_review ?? null;
  const theirs = state?.counterpart_review ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 type-h5">
            <Star className="size-4 text-warning" aria-hidden="true" />
            {copy.title}
          </h2>
          <p className="mt-1 type-body-sm text-muted-foreground">{copy.body}</p>
        </div>
        {panel === "eligible" && !writing ? (
          <Button size="sm" onClick={() => setWriting(true)}>
            Leave a review
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}

      {state && panel === "eligible" ? (
        <p className="mt-3 type-body-sm text-muted-foreground">
          Review by {formatDate(state.window_closes_at)} ·{" "}
          {reviewWindowLabel(state.window_closes_at, new Date(state.server_time))}
        </p>
      ) : null}

      {panel === "eligible" && writing ? (
        <div className="mt-5 border-t border-border pt-5">
          <ReviewForm
            bookingId={bookingId}
            audience={audience}
            onSubmitted={() => setWriting(false)}
            onCancel={() => setWriting(false)}
          />
        </div>
      ) : null}

      {mine ? (
        <div className="mt-4 space-y-3">
          <ReviewCard
            heading="Your review"
            review={toPublic(mine, "You")}
            canReport={false}
          />
          {panel === "submitted_pending" ? (
            <p className="type-body-sm text-muted-foreground">
              Nobody else can see this yet. It&apos;s shared when the other person submits theirs,
              or on {state ? formatDate(state.window_closes_at) : "the review deadline"}.
            </p>
          ) : null}
        </div>
      ) : null}

      {theirs ? (
        <div className="mt-3">
          <ReviewCard
            heading={audience === "renter" ? "Your host's review" : "Your renter's review"}
            review={theirs}
            canReport
          />
        </div>
      ) : null}

      {state?.counterpart_hidden_by_moderation ? (
        <p className="mt-3 type-body-sm text-muted-foreground">
          Review unavailable — it&apos;s hidden while our support team looks at it.
        </p>
      ) : null}

      {panel === "window_closed_unreviewed" && !mine ? (
        <p className="mt-3 type-body-sm text-muted-foreground">
          You didn&apos;t leave a review for this booking, and the review period has now closed.
        </p>
      ) : null}
    </section>
  );
}

/** Renders the author's own review through the same safe display shape. */
function toPublic(
  review: NonNullable<ReturnType<typeof useBookingReviewState>["data"]>["my_review"],
  authorName: string,
): PublicReview {
  const row = review!;
  return {
    id: row.id,
    rating: row.rating,
    review_text: row.review_text,
    submitted_at: row.submitted_at,
    author_name: authorName,
    rating_accuracy: row.rating_accuracy,
    rating_access: row.rating_access,
    rating_communication: row.rating_communication,
    rating_condition: row.rating_condition,
  };
}

/** Small inline rating line, e.g. next to a host name. */
export function InlineRating({ value, count }: { value: number; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StarRatingDisplay value={Math.round(value)} />
      <span className="type-body-sm tabular-nums">{value.toFixed(1)}</span>
      <span className="type-body-sm text-muted-foreground">({count})</span>
    </span>
  );
}
