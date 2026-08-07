/**
 * Chapter 2 — the AI transformation.
 *
 * The signature moment: a believably untidy garage, the planner reasoning out
 * loud, then every belonging moving into its optimised position. Both layouts
 * come from the same deterministic engine the interactive demo uses, so this
 * chapter can never show a plan the product would not produce.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useCountUp, useInView } from "@/hooks/use-motion";
import { PlanScene } from "@/components/spaceplanner/PlanScene";
import { Button } from "@/components/ui/button";
import { startDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";
import {
  GARAGE_STORY,
  TRANSFORMATION_BEATS,
  buildPlan,
  sceneLines,
  sceneSpace,
} from "@/lib/spaceplanner";

const SPACE = sceneSpace(GARAGE_STORY);
const LINES = sceneLines(GARAGE_STORY);

export function AiTransformation() {
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
  const clear = (used: number) => Math.max(0, Math.min(100, Math.round(100 - (used / floorArea) * 100)));
  const clearBefore = clear(plan.before.floorAreaUsed);
  const clearAfter = clear(plan.after.floorAreaUsed);
  const target = organised ? clearAfter : clearBefore;
  const animated = useCountUp(target, 1100, inView);

  return (
    <section
      aria-labelledby="transformation-heading"
      className="border-y border-border/70 bg-surface/60 py-12 sm:py-16"
    >
      <div ref={ref} className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-xl">
          <h2 id="transformation-heading" className="type-h1">
            Watch it organise a real garage.
          </h2>
          <p className="mt-3 type-body text-muted-foreground">
            Same belongings. Same room. Planned in seconds.
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <PlanScene
            space={SPACE}
            pack={plan.after}
            from={plan.before}
            organised={organised}
            thinking={thinking}
            explain
            label={`Plan view of a ${SPACE.name.toLowerCase()}, ${organised ? "organised by Spacilo AI" : "before planning"}`}
          />

          <div className="min-w-0">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
              <p className="type-overline text-muted-foreground">Estimated floor kept clear</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="type-hero tabular-nums">{Math.round(animated)}%</span>
                <span
                  className={cn(
                    "type-badge transition-colors",
                    organised ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {organised ? `up from ${clearBefore}%` : "before planning"}
                </span>
              </p>

              <ol className="mt-5 space-y-2" aria-live="polite">
                {TRANSFORMATION_BEATS.slice(1).map((step, index) => {
                  const reached = beat >= index + 1;
                  return (
                    <li
                      key={step.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-500",
                        reached ? "bg-primary-soft/50 text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          beat === index + 1
                            ? "bg-primary motion-safe:animate-twinkle"
                            : reached
                              ? "bg-primary"
                              : "bg-border-strong",
                        )}
                      />
                      <span className="min-w-0 truncate type-body-sm">{step.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <Button
              block
              size="lg"
              className="mt-4"
              onClick={() => {
                track("cta_clicked", { props: { cta: "try_spaceplanner", from: "homepage_transformation" } });
                startDemo();
              }}
            >
              Plan your own space
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
