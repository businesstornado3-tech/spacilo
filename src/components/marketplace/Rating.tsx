import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface RatingProps {
  value: number;
  reviewCount?: number;
  className?: string;
  size?: "sm" | "md";
}

/** Compact numeric rating: ★ 4.9 · 27 reviews */
export function Rating({ value, reviewCount, className, size = "md" }: RatingProps) {
  const label =
    reviewCount === undefined
      ? `Rated ${value.toFixed(1)} out of 5`
      : `Rated ${value.toFixed(1)} out of 5 from ${reviewCount} reviews`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums text-foreground",
        size === "sm" ? "type-body-sm" : "type-label",
        className,
      )}
      aria-label={label}
    >
      <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
      <span>{value.toFixed(1)}</span>
      {reviewCount !== undefined ? (
        <span className="font-normal text-muted-foreground">
          · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
        </span>
      ) : null}
    </span>
  );
}

interface ReviewProps {
  authorName: string;
  authorInitials?: string;
  rating: number;
  date: string;
  body: string;
  /** Reviews can only be left after a completed booking */
  fromBooking?: boolean;
  className?: string;
}

export function Review({
  authorName,
  authorInitials,
  rating,
  date,
  body,
  fromBooking = true,
  className,
}: ReviewProps) {
  return (
    <article className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft type-label text-primary-soft-foreground"
        >
          {authorInitials ?? authorName.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="type-label truncate">{authorName}</p>
          <p className="type-body-sm text-muted-foreground">{date}</p>
        </div>
        <Rating value={rating} className="ml-auto" size="sm" />
      </header>
      <p className="mt-3 type-body-sm text-foreground">{body}</p>
      {fromBooking ? (
        <p className="mt-3 type-body-sm text-muted-foreground">Review from a completed booking</p>
      ) : null}
    </article>
  );
}
