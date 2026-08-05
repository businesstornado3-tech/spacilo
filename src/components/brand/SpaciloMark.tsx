import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol.
 *
 * One compact geometric mark that carries both halves of the proposition:
 *  - the hexagon is the SPACE / ROOM — a contained, protected volume,
 *  - the S inside is the Spacilo initial drawn as an open route through it,
 *  - the three rising bars at the base read as VALUE / INCOME.
 *
 * The hexagon takes `currentColor`, so the mark inherits any semantic token.
 * Everything inside is drawn in `innerClassName` (the knock-out colour),
 * which defaults to the primary foreground token.
 */
export function SpaciloSymbol({
  className,
  innerClassName = "fill-[var(--color-primary-foreground)] stroke-[var(--color-primary-foreground)]",
}: {
  className?: string;
  innerClassName?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      {/* SPACE — the contained hexagonal volume */}
      <path
        d="M16 2.2 27.9 9v14L16 29.8 4.1 23V9Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* The Spacilo S, drawn as an open path through the space */}
      <path
        d="M20.4 11.9c-1-1.3-2.5-2-4.4-2-2.6 0-4.3 1.2-4.3 3 0 3.9 8.7 1.8 8.7 5.9 0 1.9-1.8 3.1-4.4 3.1-1.9 0-3.4-.6-4.4-1.9"
        className={innerClassName}
        fill="none"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      {/* VALUE — quiet rising bars at the base */}
      <g className={innerClassName} stroke="none">
        <rect x="11.3" y="24.1" width="2.2" height="2.2" rx="1.1" opacity="0.5" />
        <rect x="14.9" y="23" width="2.2" height="3.3" rx="1.1" opacity="0.75" />
        <rect x="18.5" y="21.6" width="2.2" height="4.7" rx="1.1" />
      </g>
    </svg>
  );
}

/** Symbol + wordmark lock-up. */
export function SpaciloLockup({
  className,
  symbolClassName,
  wordmarkClassName,
}: {
  className?: string;
  symbolClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SpaciloSymbol className={cn("size-9 text-primary", symbolClassName)} />
      <span
        className={cn(
          "font-display text-[1.2rem] font-bold tracking-[-0.035em] text-foreground",
          wordmarkClassName,
        )}
      >
        {brand.name}
      </span>
    </span>
  );
}
