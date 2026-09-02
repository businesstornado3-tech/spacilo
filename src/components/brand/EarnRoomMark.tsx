import * as React from "react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * The approved Spacilo symbol — a faithful vector reproduction of the final
 * approved brand asset.
 *
 * Geometry (do not reinterpret):
 *  - an open hexagonal spatial frame broken into two identical arms that are
 *    180°-rotationally symmetric,
 *  - each arm runs from a free rounded terminal, around three hexagon edges,
 *    then turns horizontally into the centre — creating the open horizontal
 *    relationship through the middle of the mark,
 *  - a recognisable "$" sits free in the central opening: VALUE / EARNING.
 *
 * The whole mark is drawn in `currentColor`, so every variant (default, light,
 * dark/reversed, monochrome) derives from this one master geometry and differs
 * only in colour treatment.
 */

/** Upper arm: terminal on the right, over the top, down the left, into the centre. */
export const FRAME_ARM_UPPER = "M58 26V18L32 4 6 18v14h14";
/** Lower arm: exact 180° rotation of the upper arm. */
export const FRAME_ARM_LOWER = "M6 38v8l26 14 26-14V32H44";

/** The stylised $ — an S spine pierced by a vertical value stroke. */
export const DOLLAR_SPINE =
  "M38 26c0-2.6-2.7-4.4-6-4.4s-6 1.8-6 4.4c0 2.4 2 3.6 6 4.6s6 2.2 6 4.6c0 2.6-2.7 4.4-6 4.4s-6-1.8-6-4.4";
export const DOLLAR_STEM = "M32 19.4V47.2";

function MarkPaths({
  frameWidth,
  spineWidth,
  stemWidth,
}: {
  frameWidth: number;
  spineWidth: number;
  stemWidth: number;
}) {
  return (
    <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* SPACE / STORAGE — the open hexagonal frame */}
      <g strokeWidth={frameWidth}>
        <path d={FRAME_ARM_UPPER} />
        <path d={FRAME_ARM_LOWER} />
      </g>
      {/* VALUE / EARNING — the central $ */}
      <path d={DOLLAR_SPINE} strokeWidth={spineWidth} />
      <path d={DOLLAR_STEM} strokeWidth={stemWidth} />
    </g>
  );
}

export function SpaciloSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8", className)}
    >
      <MarkPaths frameWidth={6} spineWidth={4.4} stemWidth={3.6} />
    </svg>
  );
}

/**
 * Small-size / icon-only variant: identical approved geometry with slightly
 * heavier optical weights so the $ stays recognisable at favicon sizes.
 */
export function SpaciloSymbolCompact({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8", className)}
    >
      <MarkPaths frameWidth={6.6} spineWidth={5} stemWidth={4.2} />
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

/** Kept so `React` import stays meaningful for consumers using refs/ids later. */
export type SpaciloMarkProps = React.ComponentProps<typeof SpaciloSymbol>;
