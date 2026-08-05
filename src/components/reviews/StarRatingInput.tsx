/**
 * Accessible star rating control.
 *
 * Rendered as a real radiogroup: each star is a radio, arrow keys move between
 * them, and the accessible name is "4 — Very good", never five decorative
 * icons. Also used, in a compact form, for the optional sub-ratings.
 */
import * as React from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { RATING_LABEL, RATING_VALUES } from "@/lib/reviews";

interface StarRatingInputProps {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  id: string;
  size?: "sm" | "md";
  disabled?: boolean;
  describedBy?: string;
}

export function StarRatingInput({
  value,
  onChange,
  label,
  id,
  size = "md",
  disabled = false,
  describedBy,
}: StarRatingInputProps) {
  const starSize = size === "sm" ? "size-6" : "size-9";

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const current = value ?? 0;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(5, current + 1) || 1);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(1, current - 1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      id={id}
      className="flex flex-wrap items-center gap-2"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-1">
        {RATING_VALUES.map((star) => {
          const selected = value === star;
          const filled = value !== null && star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${star} out of 5 — ${RATING_LABEL[star]}`}
              tabIndex={selected || (value === null && star === 1) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(star)}
              className={cn(
                "rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                disabled ? "cursor-not-allowed opacity-60" : "hover:bg-surface",
              )}
            >
              <Star
                className={cn(
                  starSize,
                  filled ? "fill-warning text-warning" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <span aria-live="polite" className="type-body-sm text-muted-foreground">
        {value === null
          ? "No rating chosen"
          : `${value} out of 5 — ${RATING_LABEL[value as 1 | 2 | 3 | 4 | 5]}`}
      </span>
    </div>
  );
}

/** Read-only stars with a proper text alternative. */
export function StarRatingDisplay({
  value,
  className,
  size = "sm",
}: {
  value: number;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`Rated ${value} out of 5`}
    >
      {RATING_VALUES.map((star) => (
        <Star
          key={star}
          className={cn(
            size === "sm" ? "size-4" : "size-5",
            star <= value ? "fill-warning text-warning" : "text-border",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
