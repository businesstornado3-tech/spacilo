/**
 * The signature Spacilo AI moment, as a reusable scene.
 *
 * A believably untidy garage, the planner reasoning out loud, then every
 * belonging moving into its optimised position. Both layouts come from the
 * same deterministic engine the interactive demo uses, so this can never show
 * a plan the product would not produce.
 *
 * Used by the hero (large, cinematic) and by any section that wants the same
 * story at a smaller size.
 */
import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useCountUp, useInView } from "@/hooks/use-motion";
import { PlanScene } from "@/components/spaceplanner/PlanScene";
import {
  GARAGE_STORY,
  TRANSFORMATION_BEATS,
  buildPlan,
  sceneLines,
  sceneSpace,
} from "@/lib/spaceplanner";

const SPACE = sceneSpace(GARAGE_STORY);
const LINES = sceneLines(GARAGE_STORY);

export interface TransformationSceneProps {
  /** Enables hover/focus explanations on each object. */
  explain?: boolean;
  className?: string;
}

/**
 * Runs the narrated transformation loop and renders the room plus a compact
 * reasoning strip. Under reduced motion the optimised layout is shown at once.
 */
export function TransformationScene({ explain = false, className }: TransformationSceneProps) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [beat, setBeat] = React.useState(0);
  const plan = React.useMemo(() => buildPlan(LINES, SPACE), []);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setBeat(TRANSFORMATION_BEATS.length - 1);
      return;
    }
    let timer = 0;
    const schedule = (index: number) => {
      timer = window.setTimeout(() => {
        const next = (index + 1) % TRANSFORMATION_BEATS.length;
        setBeat(next);
        schedule(next);
      }, TRANSFORMATION_BEATS[index]!.ms);
    };
    setBeat(0);
    schedule(0);
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) schedule(0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, inView]);

  const current = TRANSFORMATION_BEATS[beat]!;
  const organised = current.organised;
  const thinking = beat > 0 && !organised;

  // Honest, derived improvement: how much of the floor stays walkable once the
  // same belongings are stacked, stood upright and pushed to the walls.
  const floorArea = SPACE.width * SPACE.depth;
  const clear = (used: number) =>
    Math.max(0, Math.min(100, Math.round(100 - (used / floorArea) * 100)));
  const clearBefore = clear(plan.before.floorAreaUsed);
  const clearAfter = clear(plan.after.floorAreaUsed);
  const animated = useCountUp(organised ? clearAfter : clearBefore, 1100, inView);

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-3 shadow-raised sm:p-4">
        <PlanScene
          space={SPACE}
          pack={plan.after}
          from={plan.before}
          organised={organised}
          thinking={thinking}
          {...(explain ? { explain: true } : {})}
          label={`Plan view of a ${SPACE.name.toLowerCase()}, ${organised ? "organised by Spacilo AI" : "before planning"}`}
        />

        {/* Reasoning strip — replaces any spinner. */}
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
          <p className="flex min-w-0 items-center gap-2" aria-live="polite">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                organised ? "bg-primary" : "bg-signal motion-safe:animate-twinkle",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate type-body-sm text-muted-foreground">
              {organised ? (
                <span className="inline-flex items-center gap-1.5 type-label text-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  Optimised
                </span>
              ) : (
                current.label
              )}
            </span>
          </p>
          <p className="shrink-0 text-right">
            <span className="type-h4 tabular-nums">{Math.round(animated)}%</span>{" "}
            <span className="type-badge text-muted-foreground">
              {organised ? `floor clear, up from ${clearBefore}%` : "floor clear"}
            </span>
          </p>
        </div>
      </div>
      <p className="mt-2 type-badge text-muted-foreground">
        Illustrative plan produced by Spacilo AI SpacePlanner™ from real item dimensions.
      </p>
    </div>
  );
}
