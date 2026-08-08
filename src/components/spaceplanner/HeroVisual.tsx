/**
 * <HeroVisual /> — the hero's animation slot.
 *
 * A stable, reusable container that reserves the cinematic area on the right
 * of the hero. Whatever is passed as `children` is rendered inside it, so the
 * current planner animation can be swapped for a future cinematic garage
 * component without touching the homepage layout.
 *
 * Nothing here knows about the planner, SVG scenes or any data source.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { HeroCinematic } from "@/components/home/HeroCinematic";

export interface HeroVisualProps {
  /** The visual to render. Defaults to the cinematic homepage animation. */
  children?: React.ReactNode;
  className?: string;
}

export function HeroVisual({ children, className }: HeroVisualProps) {
  return (
    <div
      data-hero-visual=""
      className={cn("min-w-0 lg:sticky lg:top-24", className)}
      aria-live="off"
    >
      {children ?? <HeroCinematic />}
    </div>
  );
}
