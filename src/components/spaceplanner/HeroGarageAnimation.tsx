/**
 * <HeroGarageAnimation /> — the signature Spacilo visual.
 *
 * A real UK residential garage: concrete floor, brick walls, an up-and-over
 * door letting daylight in, shelving, a workbench and the belongings a real
 * household actually keeps out there. It sits still long enough to be
 * recognised, then Spacilo AI narrates a pass over the room while every
 * belonging moves — with weight, easing and settling — into an optimised
 * position, and the usable floor space climbs with it.
 *
 * Deliberately independent of homepage logic: it takes no props beyond
 * presentation, loads nothing, and can be dropped into host onboarding,
 * marketing pages or a product demo unchanged.
 */
import * as React from "react";
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useInView } from "@/hooks/use-motion";
import { GarageObjectArt } from "@/components/spaceplanner/GarageObjectArt";
import {
  GARAGE_BEATS,
  GARAGE_DONE_INDEX,
  GARAGE_FINAL_CLEAR,
  GARAGE_HORIZON,
  GARAGE_OBJECTS,
  GARAGE_VIEWBOX,
  objectDelayMs,
  type GaragePose,
} from "@/lib/home/garage-scene";

/** Weighted settle: quick departure, slow arrival, no overshoot on heavy items. */
const SETTLE = "cubic-bezier(0.22, 0.9, 0.18, 1)";

function poseTransform(pose: GaragePose) {
  return `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale})`;
}

export interface HeroGarageAnimationProps {
  className?: string;
  /** Caption shown beneath the scene. Set to null to hide it. */
  caption?: string | null;
}

export function HeroGarageAnimation({
  className,
  caption = "Illustrative optimisation by Spacilo AI SpacePlanner™.",
}: HeroGarageAnimationProps) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [step, setStep] = React.useState(0);

  // Narration loop. Reduced motion shows only the finished, organised garage.
  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStep(GARAGE_DONE_INDEX);
      return;
    }
    let timer = 0;
    const schedule = (index: number) => {
      timer = window.setTimeout(() => {
        const next = (index + 1) % GARAGE_BEATS.length;
        setStep(next);
        schedule(next);
      }, GARAGE_BEATS[index]!.ms);
    };
    setStep(0);
    schedule(0);
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        setStep(0);
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inView, reduced]);

  const beat = GARAGE_BEATS[step]!;
  const done = step === GARAGE_DONE_INDEX;
  const progress = Math.round((step / GARAGE_DONE_INDEX) * 100);

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <figure className="m-0 overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-raised">
        <div className="relative">
          <svg
            viewBox={`0 0 ${GARAGE_VIEWBOX.width} ${GARAGE_VIEWBOX.height}`}
            className="block aspect-[100/62] w-full"
            role="img"
            aria-label={
              done
                ? "A residential garage after Spacilo AI has organised it: bikes on the wall, boxes shelved and a clear walkway."
                : "A cluttered residential garage with bikes, boxes, a mattress and household belongings on the floor."
            }
          >
            <defs>
              <linearGradient id="hga-wall" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-wall)" />
                <stop offset="100%" stopColor="var(--color-scene-floor-line)" />
              </linearGradient>
              <linearGradient id="hga-floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-floor-line)" />
                <stop offset="55%" stopColor="var(--color-scene-floor)" />
                <stop offset="100%" stopColor="var(--color-scene-floor-line)" />
              </linearGradient>
              <radialGradient id="hga-daylight" cx="50%" cy="18%" r="70%">
                <stop offset="0%" stopColor="var(--color-scene-wall)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--color-scene-wall)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Room shell */}
            <rect x="0" y="0" width="1000" height={GARAGE_HORIZON} fill="url(#hga-wall)" />
            <rect
              x="0"
              y={GARAGE_HORIZON}
              width="1000"
              height={GARAGE_VIEWBOX.height - GARAGE_HORIZON}
              fill="url(#hga-floor)"
            />

            {/* Concrete floor, receding */}
            <g className="stroke-scene-floor-line" strokeWidth="2" opacity="0.75">
              {[420, 470, 528, 594].map((y) => (
                <line key={y} x1="0" y1={y} x2="1000" y2={y} />
              ))}
              {[-260, 60, 340, 660, 940, 1260].map((x) => (
                <line key={x} x1={340 + (x - 340) * 0.42} y1={GARAGE_HORIZON} x2={x} y2="620" />
              ))}
            </g>

            {/* Brick walls */}
            {[0, 760].map((x0) => (
              <g key={x0} className="stroke-scene-card-dark" strokeWidth="1.6" opacity="0.35">
                {Array.from({ length: 12 }, (_, r) => 40 + r * 28).map((y) => (
                  <React.Fragment key={y}>
                    <line x1={x0} y1={y} x2={x0 + 240} y2={y} />
                    {Array.from({ length: 4 }, (_, c) => x0 + c * 60 + ((y / 28) % 2 ? 30 : 0)).map(
                      (bx) => (
                        <line key={bx} x1={bx} y1={y} x2={bx} y2={y + 28} />
                      ),
                    )}
                  </React.Fragment>
                ))}
              </g>
            ))}

            {/* Up-and-over garage door, slightly open with daylight beneath */}
            <rect x="320" y="52" width="370" height={GARAGE_HORIZON - 52} rx="6" className="fill-scene-metal" />
            {[92, 148, 204, 260, 316].map((y) => (
              <rect key={y} x="330" y={y} width="350" height="44" rx="4" className="fill-scene-metal-dark" opacity="0.28" />
            ))}
            <rect x="320" y={GARAGE_HORIZON - 10} width="370" height="10" className="fill-scene-wall" opacity="0.9" />
            <ellipse cx="505" cy={GARAGE_HORIZON + 60} rx="290" ry="70" fill="url(#hga-daylight)" />

            {/* Shelving, left wall */}
            <g>
              <rect x="34" y="196" width="266" height="8" rx="3" className="fill-scene-wood" />
              <rect x="34" y="240" width="266" height="8" rx="3" className="fill-scene-wood" />
              <rect x="34" y="304" width="266" height="8" rx="3" className="fill-scene-wood" />
              <rect x="34" y="196" width="10" height="176" className="fill-scene-wood-dark" />
              <rect x="290" y="196" width="10" height="176" className="fill-scene-wood-dark" />
            </g>

            {/* Workbench and pegboard, right wall */}
            <g>
              <rect x="690" y="196" width="290" height="86" rx="4" className="fill-scene-card" opacity="0.5" />
              <rect x="680" y="282" width="300" height="12" rx="4" className="fill-scene-wood" />
              <rect x="690" y="294" width="12" height="78" className="fill-scene-wood-dark" />
              <rect x="958" y="294" width="12" height="78" className="fill-scene-wood-dark" />
            </g>

            {/* Wall-to-floor shadow */}
            <rect x="0" y={GARAGE_HORIZON} width="1000" height="26" className="fill-scene-ink" opacity="0.07" />

            {/* Belongings */}
            {GARAGE_OBJECTS.map((object, index) => {
              const settled = reduced || step >= object.step;
              const pose = settled ? object.after : object.before;
              return (
                <g
                  key={object.id}
                  style={{
                    transformBox: "view-box",
                    transformOrigin: "0 0",
                    transform: poseTransform(pose),
                    transition: reduced
                      ? undefined
                      : `transform 1500ms ${SETTLE} ${objectDelayMs(index)}ms`,
                    willChange: "transform",
                  }}
                >
                  <ellipse cx="0" cy="2" rx="34" ry="7" className="fill-scene-ink" opacity="0.12" />
                  <GarageObjectArt kind={object.kind} />
                </g>
              );
            })}

            {/* Clear walkway, revealed as the plan completes */}
            <ellipse
              cx="500"
              cy="540"
              rx="230"
              ry="58"
              className="fill-scene-accent"
              style={{
                opacity: done ? 0.12 : 0,
                transition: reduced ? undefined : "opacity 900ms ease-out",
              }}
            />
          </svg>

          {/* Status chip */}
          <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 shadow-card backdrop-blur type-badge sm:left-4 sm:top-4">
            {done ? (
              <>
                <Check className="size-3.5 text-primary" aria-hidden="true" />
                Optimised successfully
              </>
            ) : (
              <>
                <Sparkles
                  className="size-3.5 text-signal motion-safe:animate-twinkle"
                  aria-hidden="true"
                />
                Spacilo AI SpacePlanner™
              </>
            )}
          </div>
        </div>

        {/* Narration + live floor space counter */}
        <div className="border-t border-border/70 bg-card px-4 py-3 sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
            <p className="min-w-0 truncate type-body-sm text-muted-foreground" aria-live="polite">
              {beat.label}
            </p>
            <p className="shrink-0 text-right">
              <span className="type-h4 tabular-nums">{beat.clear}%</span>{" "}
              <span className="type-badge text-muted-foreground">usable floor space</span>
            </p>
          </div>

          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-label="Storage optimisation progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full rounded-full", done ? "bg-primary" : "bg-signal")}
              style={{
                width: `${progress}%`,
                transition: reduced ? undefined : "width 900ms ease-out",
              }}
            />
          </div>

          <div
            className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ opacity: done ? 1 : 0.35, transition: "opacity 400ms ease-out" }}
          >
            <span className="inline-flex items-center gap-1.5 type-badge">
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              {GARAGE_FINAL_CLEAR}% more usable floor space
            </span>
            <span className="inline-flex items-center gap-1.5 type-badge">
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              Walkway clear
            </span>
          </div>
        </div>
      </figure>

      {caption ? (
        <figcaption className="mt-2 type-badge text-muted-foreground">{caption}</figcaption>
      ) : null}
    </div>
  );
}
