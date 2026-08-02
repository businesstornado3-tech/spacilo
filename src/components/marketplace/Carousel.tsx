import * as React from "react";

import { cn } from "@/lib/utils";

interface CardCarouselProps {
  children: React.ReactNode;
  /** Heading rendered above the track */
  title?: string;
  action?: React.ReactNode;
  /** Tailwind width classes applied to each item */
  itemClassName?: string;
  className?: string | undefined;
  ariaLabel?: string;
}

/**
 * Touch-friendly horizontal card rail. Snaps per card on mobile,
 * falls back to native scrolling everywhere else. No JS scroll logic.
 */
export function CardCarousel({
  children,
  title,
  action,
  itemClassName = "w-[78%] max-w-80 sm:w-72",
  className,
  ariaLabel,
}: CardCarouselProps) {
  const items = React.Children.toArray(children);

  return (
    <section className={cn("min-w-0", className)}>
      {title || action ? (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 pb-3">
          {title ? <h3 className="truncate type-h3">{title}</h3> : <span />}
          {action}
        </header>
      ) : null}
      <ul
        className="carousel-track -mx-4 gap-4 px-4 pb-2 sm:mx-0 sm:px-1"
        aria-label={ariaLabel ?? title ?? "Card carousel"}
      >
        {items.map((child, i) => (
          <li key={i} className={cn("carousel-item", itemClassName)}>
            {child}
          </li>
        ))}
      </ul>
    </section>
  );
}
