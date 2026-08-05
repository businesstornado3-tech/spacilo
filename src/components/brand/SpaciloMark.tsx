import * as React from "react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol — production SVG of the brand-board master mark.
 *
 * Geometry traced from the approved reference:
 *  - one open, angular S is the dominant silhouette (SPACILO / SPACE / STORAGE),
 *  - its upper and lower turns imply an isometric room without closing into a
 *    hexagon, cube, house or shield,
 *  - a stylised dollar mark — the brand's universal symbol for VALUE and
 *    EARNING from unused space — sitting at the centre and knocked out of the
 *    arms exactly as the reference does.
 *
 * The whole mark is drawn in `currentColor`, so it inherits any semantic
 * token: emerald on light, reversed on dark, single-ink in monochrome.
 */

/**
 * The master spatial S. Read from its open top-right terminal through the
 * upper room, centre transition and lower room to the open bottom-left
 * terminal. It remains an unmistakable S when the value mark is hidden.
 */
export const SPATIAL_S_PATH =
  "M52 13H25L12 23v8l10 7h20l10 7v6L42 59H12";

/** The stylised $ — an S spine pierced by a vertical value stroke. */
export const DOLLAR_SPINE =
  "M39.4 25.2c-1.9-2.1-4.4-3.1-7.4-3.1-4 0-6.8 2-6.8 4.9 0 3.1 2.9 4.2 7 5.1 4.5 1 7.8 2.4 7.8 5.9 0 3.3-3 5.5-7.6 5.5-3.3 0-6.2-1.2-8.2-3.5";
export const DOLLAR_STEM = "M32 17.4V47.6";

export function SpaciloSymbol({ className }: { className?: string }) {
  const maskId = React.useId();

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <defs>
        {/* Give the secondary value mark breathing room inside the spatial S. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="white" />
          <g stroke="black" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={DOLLAR_SPINE} strokeWidth="8.6" />
            <path d={DOLLAR_STEM} strokeWidth="8" />
          </g>
        </mask>
      </defs>

      {/* SPACILO / SPACE / STORAGE — one open geometric S */}
      <g
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="square"
        strokeLinejoin="bevel"
        fill="none"
      >
        <path d={SPATIAL_S_PATH} />
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
 * Small-size variant: exactly the same master S + $ geometry with heavier
 * optical weights. No alternate hexagonal icon is introduced.
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
        d={SPATIAL_S_PATH}
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeWidth="8.8"
        strokeLinecap="square"
        strokeLinejoin="bevel"
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
