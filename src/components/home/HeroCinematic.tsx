/**
 * <HeroCinematic /> — the homepage hero film.
 *
 * A marketing reveal, not the planning application: one softly lit unused
 * space, real household belongings, an AI scan pass, and everything settling
 * into an optimised arrangement before a calm success state. It loops roughly
 * every 18 seconds.
 *
 * Deliberately free of product UI — no controls, no metrics, no scoring
 * numbers, no Digital Twin. The interactive twin lives in the product routes
 * (planner, listings, booking, dashboards) and is untouched by this file.
 */
import * as React from "react";
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useInView } from "@/hooks/use-motion";
import { GarageObjectArt } from "@/components/spaceplanner/GarageObjectArt";
import { GARAGE_OBJECTS, GARAGE_VIEWBOX, type GaragePose } from "@/lib/home/garage-scene";

/** Weighted settle: quick departure, slow arrival, no overshoot on heavy items. */
const SETTLE = "cubic-bezier(0.22, 0.9, 0.18, 1)";
const HORIZON = 372;

/** Plain-language narration only. Each beat holds for `ms`. */
interface Beat {
  /** Objects whose `step` is at or below this settle during the beat. */
  step: number;
  line: string;
  ms: number;
}

const BEATS: Beat[] = [
  { step: 0, line: "Your unused space today", ms: 2400 },
  { step: 1, line: "Analysing your space…", ms: 2000 },
  { step: 3, line: "Freeing up the walls…", ms: 2200 },
  { step: 4, line: "Grouping belongings together…", ms: 2200 },
  { step: 6, line: "Filling unused corners…", ms: 2200 },
  { step: 7, line: "Stacking neatly and safely…", ms: 2000 },
  { step: 8, line: "Clearing the walkway…", ms: 2000 },
  { step: 9, line: "Optimised successfully", ms: 4400 },
];

const DONE_INDEX = BEATS.length - 1;
const OUTCOMES = ["+54% usable space", "Walkway clear", "Ready to rent"];

function poseTransform(pose: GaragePose) {
  return `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale})`;
}

export function HeroCinematic({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setIndex(DONE_INDEX);
      return;
    }
    let timer = 0;
    const schedule = (at: number) => {
      timer = window.setTimeout(() => {
        const next = (at + 1) % BEATS.length;
        setIndex(next);
        schedule(next);
      }, BEATS[at]!.ms);
    };
    setIndex(0);
    schedule(0);
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        setIndex(0);
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inView, reduced]);

  const beat = BEATS[index]!;
  const done = index === DONE_INDEX;
  const scanning = !reduced && index > 0 && !done;

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none relative min-w-0 overflow-hidden rounded-[1.75rem] bg-card shadow-raised",
        className,
      )}
      aria-hidden={false}
    >
      <div className="relative overflow-hidden">
        {/* Soft camera drift — slow push-in, no controls, no user input. */}
        <div
          className="origin-center"
          style={{
            transform: done ? "scale(1.045) translateY(-0.6%)" : "scale(1.0) translateY(0)",
            transition: reduced ? undefined : "transform 6000ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <svg
            viewBox={`0 0 ${GARAGE_VIEWBOX.width} ${GARAGE_VIEWBOX.height}`}
            className="block aspect-[100/62] w-full"
            role="img"
            aria-label={
              done
                ? "An unused home space after Spacilo AI has organised it: belongings stored neatly along the walls with a clear walkway."
                : "An unused home space with household belongings left across the floor."
            }
          >
            <defs>
              <linearGradient id="hc-wall" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-wall)" />
                <stop offset="100%" stopColor="var(--color-scene-floor-line)" />
              </linearGradient>
              <linearGradient id="hc-floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-floor-line)" />
                <stop offset="45%" stopColor="var(--color-scene-floor)" />
                <stop offset="100%" stopColor="var(--color-scene-floor-line)" />
              </linearGradient>
              <radialGradient id="hc-key" cx="50%" cy="14%" r="78%">
                <stop offset="0%" stopColor="var(--color-scene-wall)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--color-scene-wall)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hc-vignette" cx="50%" cy="45%" r="72%">
                <stop offset="55%" stopColor="var(--color-scene-ink)" stopOpacity="0" />
                <stop offset="100%" stopColor="var(--color-scene-ink)" stopOpacity="0.22" />
              </radialGradient>
              <linearGradient id="hc-scan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-accent)" stopOpacity="0" />
                <stop offset="50%" stopColor="var(--color-scene-accent)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--color-scene-accent)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hc-shelf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scene-wood)" />
                <stop offset="100%" stopColor="var(--color-scene-wood-dark)" />
              </linearGradient>
            </defs>

            {/* Room, rendered as light and material only — no visible geometry */}
            <rect x="0" y="0" width="1000" height={HORIZON + 6} fill="url(#hc-wall)" />
            <rect
              x="0"
              y={HORIZON}
              width="1000"
              height={GARAGE_VIEWBOX.height - HORIZON}
              fill="url(#hc-floor)"
            />
            <ellipse cx="500" cy={HORIZON - 40} rx="520" ry="240" fill="url(#hc-key)" />
            {/* Soft contact shadow where the wall meets the floor */}
            <rect
              x="0"
              y={HORIZON - 4}
              width="1000"
              height="30"
              className="fill-scene-ink"
              opacity="0.06"
            />
            {/* Warm pool of light on the floor */}
            <ellipse cx="510" cy="500" rx="360" ry="120" className="fill-scene-wall" opacity="0.5" />

            {/* Shelving, softened to furniture rather than structure */}
            <g opacity="0.95">
              {[196, 250, 306].map((y) => (
                <rect key={y} x="34" y={y} width="266" height="10" rx="5" fill="url(#hc-shelf)" />
              ))}
              <rect x="34" y="196" width="10" height="180" rx="5" className="fill-scene-wood-dark" opacity="0.8" />
              <rect x="290" y="196" width="10" height="180" rx="5" className="fill-scene-wood-dark" opacity="0.8" />
            </g>
            <g opacity="0.9">
              <rect x="690" y="286" width="290" height="12" rx="6" fill="url(#hc-shelf)" />
              <rect x="700" y="298" width="12" height="78" rx="6" className="fill-scene-wood-dark" opacity="0.8" />
              <rect x="956" y="298" width="12" height="78" rx="6" className="fill-scene-wood-dark" opacity="0.8" />
            </g>

            {/* Belongings settling into their optimised places */}
            {GARAGE_OBJECTS.map((object, i) => {
              const settled = reduced || beat.step >= object.step;
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
                      : `transform 1800ms ${SETTLE} ${(i % 6) * 110}ms`,
                    willChange: "transform",
                  }}
                >
                  <ellipse cx="0" cy="3" rx="36" ry="8" className="fill-scene-ink" opacity="0.1" />
                  <GarageObjectArt kind={object.kind} />
                </g>
              );
            })}

            {/* Clear walkway, revealed at the end */}
            <ellipse
              cx="500"
              cy="540"
              rx="240"
              ry="60"
              className="fill-scene-accent"
              style={{
                opacity: done ? 0.13 : 0,
                transition: reduced ? undefined : "opacity 1200ms ease-out",
              }}
            />

            {/* Subtle AI scan line */}
            {scanning ? (
              <rect
                x="0"
                y="-90"
                width="1000"
                height="90"
                fill="url(#hc-scan)"
                className="motion-safe:animate-hero-scan"
              />
            ) : null}

            <rect x="0" y="0" width="1000" height={GARAGE_VIEWBOX.height} fill="url(#hc-vignette)" />
          </svg>
        </div>

        {/* Single, plain-language status line */}
        <div
          className="absolute left-4 top-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-card/85 px-3.5 py-2 shadow-card backdrop-blur"
          style={{ transition: "opacity 500ms ease-out", opacity: done ? 1 : 0.98 }}
        >
          {done ? (
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <Sparkles
              className="size-4 shrink-0 text-signal motion-safe:animate-twinkle"
              aria-hidden="true"
            />
          )}
          <span className="truncate type-badge text-foreground">{beat.line}</span>
        </div>

        {/* Premium success state */}
        <div
          className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2"
          style={{
            opacity: done ? 1 : 0,
            transform: done ? "translateY(0)" : "translateY(8px)",
            transition: reduced ? undefined : "opacity 700ms ease-out, transform 700ms ease-out",
          }}
        >
          {OUTCOMES.map((outcome) => (
            <span
              key={outcome}
              className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 type-badge text-foreground shadow-card backdrop-blur"
            >
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              {outcome}
            </span>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {beat.line}
      </p>
    </div>
  );
}
