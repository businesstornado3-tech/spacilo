import * as React from "react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol — production SVG of the brand-board master mark.
 *
 * Geometry traced from the approved reference:
 *  - a pointy-top hexagon drawn as a heavy open ring (the SPACE / room),
 *  - the ring breaks at mid-left and mid-right, each half turning inward so the
 *    two interlocking arms read as an S,
 *  - a stylised dollar mark — the brand's universal symbol for VALUE and
 *    EARNING from unused space — sitting at the centre and knocked out of the
 *    arms exactly as the reference does.
 *
 * The whole mark is drawn in `currentColor`, so it inherits any semantic
 * token: emerald on light, reversed on dark, single-ink in monochrome.
 */

/** The approved hexagon-ring arms, stepped and crossed into an S. */
export const HEX_ARM_UPPER = "M6 33.4V17.3L32 3.2l26 14.1v16.1H25.4";
export const HEX_ARM_LOWER = "M58 30.6v16.1L32 60.8 6 46.7V30.6h32.6";

/** The stylised $ — an S spine pierced by a vertical value stroke. */
export const DOLLAR_SPINE =
  "M39.4 25.2c-1.9-2.1-4.4-3.1-7.4-3.1-4 0-6.8 2-6.8 4.9 0 3.1 2.9 4.2 7 5.1 4.5 1 7.8 2.4 7.8 5.9 0 3.3-3 5.5-7.6 5.5-3.3 0-6.2-1.2-8.2-3.5";
export const DOLLAR_STEM = "M32 17.4V47.6";

export function SpaciloSymbol({ className }: { className?: string }) {
  const maskId = React.useId();

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <defs>
        {/* Knock the value symbol out of the hexagonal arms. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="white" />
          <g stroke="black" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={DOLLAR_SPINE} strokeWidth="8.6" />
            <path d={DOLLAR_STEM} strokeWidth="8" />
          </g>
        </mask>
      </defs>

      {/* SPACE — the open hexagonal ring stepped and crossed into an S */}
      <g
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d={HEX_ARM_UPPER} />
        <path d={HEX_ARM_LOWER} />
      </g>

      {/* VALUE — the stylised $: earning from unused space */}
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={DOLLAR_SPINE} strokeWidth="4.4" />
        <path d={DOLLAR_STEM} strokeWidth="3.4" />
      </g>
    </svg>
  );
}

/**
 * Simplified variant for favicon / PWA icon / very small contexts: the same
 * silhouette and the same $, with the arm step removed so the ring survives
 * at 16px. The master mark above keeps the full construction.
 */
export function SpaciloSymbolCompact({ className }: { className?: string }) {
  const maskId = React.useId();

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="white" />
          <g stroke="black" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={DOLLAR_SPINE} strokeWidth="12" />
            <path d={DOLLAR_STEM} strokeWidth="11" />
          </g>
        </mask>
      </defs>
      <path
        d="M32 3.6 57 17.6v28.8L32 60.4 7 46.4V17.6Z"
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="round"
        fill="none"
      />
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={DOLLAR_SPINE} strokeWidth="5.2" />
        <path d={DOLLAR_STEM} strokeWidth="4" />
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
