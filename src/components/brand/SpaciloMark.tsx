import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The Spacilo symbol.
 *
 * Geometry only, no literal storage clichés:
 *  - the outer rounded aperture is a SPACE / ROOM / OPENING,
 *  - the gap on the right edge is the way in,
 *  - the three rising bars inside read quietly as growing value / income.
 *
 * Drawn with `currentColor` so it inherits any semantic token colour.
 */
export function SpaciloSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      {/* room / aperture with an opening on the right */}
      <path
        d="M23.5 5.5H9.5A4 4 0 0 0 5.5 9.5v13a4 4 0 0 0 4 4h13a4 4 0 0 0 4-4v-3.6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* rising value bars */}
      <rect x="10" y="17" width="2.8" height="5" rx="1.4" fill="currentColor" opacity="0.55" />
      <rect x="14.6" y="14" width="2.8" height="8" rx="1.4" fill="currentColor" opacity="0.78" />
      <rect x="19.2" y="10.5" width="2.8" height="11.5" rx="1.4" fill="currentColor" />
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
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground",
          symbolClassName,
        )}
      >
        <SpaciloSymbol className="size-6" />
      </span>
      <span
        className={cn(
          "font-display text-[1.125rem] font-bold tracking-[-0.03em] text-foreground",
          wordmarkClassName,
        )}
      >
        {brand.name}
      </span>
    </span>
  );
}
