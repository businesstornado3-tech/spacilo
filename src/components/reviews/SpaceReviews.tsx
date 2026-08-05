/**
 * Public reviews for a storage listing.
 *
 * Only renter → host/space reviews appear here, and only through
 * `get_space_reviews`, which returns rating, text, first name and month.
 * Host → renter feedback is never part of this surface.
 */
import * as React from "react";
import { Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { useSpaceReviews, useSpaceReviewSummary } from "@/hooks/useReviews";
import { completedBookingsLabel, formatRating, reputationLabel } from "@/lib/reviews";

const PAGE_SIZE = 10;

export function SpaceReviews({ spaceId }: { spaceId: string }) {
  const [pages, setPages] = React.useState(1);
  const { data: summary } = useSpaceReviewSummary(spaceId);
  const { data: page, isLoading } = useSpaceReviews(spaceId, pages - 1, PAGE_SIZE);
  const [loaded, setLoaded] = React.useState<Record<number, typeof page>>({});

  React.useEffect(() => {
    if (page) setLoaded((prev) => ({ ...prev, [pages - 1]: page }));
  }, [page, pages]);

  const reviews = Object.entries(loaded)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, value]) => value ?? []);

  const count = summary?.review_count ?? 0;
  const reputation = reputationLabel({
    review_count: count,
    average_rating: summary?.average_rating ?? null,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 type-h3">
        <Star className="size-5 text-warning" aria-hidden="true" />
        Reviews
      </h2>

      {reputation.isNew ? (
        <p className="mt-2 type-body-sm text-muted-foreground">
          No reviews yet — this is a new listing. Reviews can only be left by renters who have
          finished a booking here.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="type-price tabular-nums">{reputation.rating}</span>
          <span className="type-body-sm text-muted-foreground">
            {reputation.countLabel} · {completedBookingsLabel(summary?.completed_bookings ?? 0)}
          </span>
        </div>
      )}

      {summary?.distribution && count > 0 ? (
        <ul className="mt-4 space-y-1">
          {(["5", "4", "3", "2", "1"] as const).map((star) => {
            const value = summary.distribution?.[star] ?? 0;
            const pct = count === 0 ? 0 : Math.round((value / count) * 100);
            return (
              <li key={star} className="flex items-center gap-3">
                <span className="w-14 shrink-0 type-body-sm text-muted-foreground">
                  {star} star{star === "1" ? "" : "s"}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <span className="block h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right type-body-sm tabular-nums">{value}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {isLoading && reviews.length === 0 ? (
        <Loader2 className="mt-4 size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}

      {reviews.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      ) : null}

      {reviews.length > 0 && reviews.length < count ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          disabled={isLoading}
          onClick={() => setPages((n) => n + 1)}
        >
          {isLoading ? "Loading…" : "Show more reviews"}
        </Button>
      ) : null}
    </section>
  );
}

/** Compact "★ 4.8 (12)" / "New" line used next to a host or listing. */
export function ReputationLine({
  summary,
  newLabel = "New",
  showCompletedBookings = false,
  className,
}: {
  summary: { review_count: number; average_rating: number | null; completed_bookings?: number };
  newLabel?: string;
  showCompletedBookings?: boolean;
  className?: string;
}) {
  const reputation = reputationLabel(summary);
  if (reputation.isNew) {
    return <span className={className}>{newLabel}</span>;
  }
  return (
    <span className={className}>
      <Star className="mr-1 inline size-3.5 fill-warning text-warning" aria-hidden="true" />
      <span className="tabular-nums">{formatRating(summary.average_rating as number)}</span>{" "}
      <span className="text-muted-foreground">
        ({summary.review_count})
        {showCompletedBookings && summary.completed_bookings !== undefined
          ? ` · ${completedBookingsLabel(summary.completed_bookings)}`
          : ""}
      </span>
    </span>
  );
}
