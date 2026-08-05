import * as React from "react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol — production SVG of the brand-board master mark.
 *
 * Geometry taken from the approved reference:
 *  - a pointy-top hexagon drawn as a heavy open ring (the SPACE / room),
 *  - the ring is broken at mid-left and mid-right, each half turning inward
 *    so the two interlocking arms read as an S,
 *  - a centred value token — a coin pierced by a vertical stroke — knocked out
 *    of the arms exactly as the reference knocks its currency motif out.
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
        {/* Knock the value token out of the interlocking arms. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="white" />
          <g stroke="black" fill="none" strokeLinecap="round">
            <path d="M32 15.5V48.5" strokeWidth="10.5" />
            <circle cx="32" cy="32" r="8.6" strokeWidth="8" />
          </g>
        </mask>
      </defs>

      {/* SPACE — the open hexagonal ring, split into two interlocking arms */}
      <g
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="6.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M7 31.2V17.3L32 3.2l25 14.1v13.9H25.6" />
        <path d="M57 32.8v13.9L32 60.8 7 46.7V32.8h31.4" />
      </g>

      {/* VALUE — a currency-neutral token: a coin pierced by a value stroke */}
      <g
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M32 19.5V44.5" />
        <circle cx="32" cy="32" r="6.6" />
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
