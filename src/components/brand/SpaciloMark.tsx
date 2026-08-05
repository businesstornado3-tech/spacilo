import * as React from "react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol — production SVG of the brand-board master mark.
 *
 * Geometry traced from the approved reference:
 *  - a pointy-top hexagon drawn as a heavy open ring (the SPACE / room),
 *  - the ring breaks with a step at mid-right and mid-left and crosses the
 *    centre on a shallow diagonal, so the single continuous arm reads as an S,
 *  - a centred value token — a coin pierced by a vertical stroke — knocked out
 *    of the arm exactly as the reference knocks its currency motif out.
 *
 * The literal dollar denomination of the reference is abstracted into a
 * currency-neutral value token so the identity works internationally.
 *
 * The whole mark is drawn in `currentColor`, so it inherits any semantic
 * token: emerald on light, reversed on dark, single-ink in monochrome.
 */
export function SpaciloSymbol({ className }: { className?: string }) {
  const maskId = React.useId();

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <defs>
        {/* Knock the value token out of the hexagonal arm. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="white" />
          <g stroke="black" fill="none" strokeLinecap="round">
            <path d="M32 19V45" strokeWidth="11" />
            <circle cx="32" cy="32" r="7.2" strokeWidth="8.5" />
          </g>
        </mask>
      </defs>

      {/* SPACE — the open hexagonal ring stepped and crossed into an S */}
      <g
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M58 22.5V17.5L32 3.2 6 17.5v16.9l52-4v16.1L32 60.8 6 46.5v-4.2" />
      </g>

      {/* VALUE — a currency-neutral token: a coin pierced by a value stroke */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <path d="M32 21.5V42.5" strokeWidth="3.6" />
        <circle cx="32" cy="32" r="7.2" strokeWidth="4" />
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
