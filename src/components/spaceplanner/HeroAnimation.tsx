/**
 * The hero garage scene.
 *
 * One real garage, told as a story: it starts cluttered exactly as the naive
 * pass loads it, Spacilo AI analyses it, then every object slides, rotates and
 * stacks into the optimised plan. Both layouts come from the same
 * deterministic engine the interactive demo uses, so the hero can never show a
 * plan the product would not produce.
 *
 * Motion is limited to `transform` and `opacity` (compositor-only) and stops
 * entirely for `prefers-reduced-motion`, where the finished plan is shown.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import { SceneObject } from "@/components/spaceplanner/ObjectArt";
import { buildPlan, CATALOGUE_BY_ID, SPACE_BY_ID, type InventoryLine } from "@/lib/spaceplanner";

const HERO_LINES: InventoryLine[] = [
  { item: CATALOGUE_BY_ID.get("medium-box")!, quantity: 6 },
  { item: CATALOGUE_BY_ID.get("bicycle")!, quantity: 1 },
  { item: CATALOGUE_BY_ID.get("mattress")!, quantity: 1 },
  { item: CATALOGUE_BY_ID.get("suitcase")!, quantity: 2 },
  { item: CATALOGUE_BY_ID.get("television")!, quantity: 1 },
];

const HERO_SPACE = SPACE_BY_ID.get("garage")!;

/** The narrated frames. Each one is a real step of the pipeline. */
const FRAMES = [
  { id: "cluttered", label: "Your garage today", ms: 2600 },
  { id: "analysing", label: "Analysing object sizes…", ms: 1500 },
  { id: "access", label: "Checking access routes…", ms: 1400 },
  { id: "fragile", label: "Protecting fragile belongings…", ms: 1400 },
  { id: "organised", label: "Recommended layout", ms: 3400 },
] as const;

const SCALE = 100;

export function HeroAnimation({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = React.useState(reduced ? FRAMES.length - 1 : 0);
  const plan = React.useMemo(() => buildPlan(HERO_LINES, HERO_SPACE), []);

  React.useEffect(() => {
    if (reduced) {
      setFrame(FRAMES.length - 1);
      return;
    }
    let timer = 0;
    const schedule = (index: number) => {
      timer = window.setTimeout(() => {
        const next = (index + 1) % FRAMES.length;
        setFrame(next);
        schedule(next);
      }, FRAMES[index]!.ms);
    };
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
  }, [reduced]);

  const organised = frame >= 3;
  const scanning = frame >= 1 && frame <= 3;
  const w = HERO_SPACE.width * SCALE;
  const d = HERO_SPACE.depth * SCALE;

  const after = plan.after.placements;
  const before = new Map(plan.before.placements.map((p) => [p.key, p]));

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-raised sm:p-5",
        className,
      )}
      aria-label="Looping illustration of Spacilo AI reorganising a cluttered garage"
      role="img"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_0%,var(--color-primary-soft),transparent_62%)] opacity-70" />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 type-badge text-primary-soft-foreground">
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-twinkle" />
          Spacilo AI SpacePlanner
        </span>
        <span className="type-badge text-muted-foreground">{HERO_SPACE.name}</span>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-2xl bg-scene-wall">
        <svg
          viewBox={`-8 -8 ${w + 16} ${d + 16}`}
          className="aspect-4/5 w-full sm:aspect-4/3"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <pattern id="hero-boards" width="200" height="46" patternUnits="userSpaceOnUse">
              <rect width="200" height="46" className="fill-scene-floor" />
              <path d="M0 46h200" className="stroke-scene-floor-line" strokeWidth={1.4} fill="none" />
              <path d="M70 0v46M160 0v46" className="stroke-scene-floor-line" strokeWidth={1.2} fill="none" />
            </pattern>
          </defs>

          <rect x={0} y={0} width={w} height={d} rx={12} fill="url(#hero-boards)" />
          <rect
            x={0}
            y={0}
            width={w}
            height={d}
            rx={12}
            fill="none"
            className="stroke-scene-wood-dark"
            strokeWidth={3}
          />

          {plan.after.walkway ? (
            <rect
              x={plan.after.walkway.x * SCALE}
              y={plan.after.walkway.y * SCALE}
              width={plan.after.walkway.w * SCALE}
              height={plan.after.walkway.d * SCALE}
              rx={10}
              className={cn(
                "fill-primary-soft transition-opacity duration-700",
                organised ? "opacity-90" : "opacity-0",
              )}
            />
          ) : null}

          {after.map((p, index) => {
            const start = before.get(p.key) ?? p;
            const pos = organised ? p : start;
            return (
              <g
                key={p.key}
                style={{
                  transform: `translate(${pos.x * SCALE}px, ${pos.y * SCALE}px)`,
                  transitionDelay: `${index * 90}ms`,
                }}
                className="transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              >
                <rect
                  x={2.5}
                  y={4}
                  width={Math.max(pos.w * SCALE - 5, 4)}
                  height={Math.max(pos.d * SCALE - 5, 4)}
                  rx={10}
                  className="fill-scene-ink opacity-[0.09]"
                />
                <rect
                  width={pos.w * SCALE}
                  height={pos.d * SCALE}
                  rx={10}
                  className="fill-scene-wall stroke-scene-line"
                  strokeWidth={1.5}
                />
                <SceneObject icon={p.icon} x={0} y={0} w={pos.w * SCALE} h={pos.d * SCALE} />
              </g>
            );
          })}

          {/* the opening */}
          <line
            x1={(HERO_SPACE.width / 2 - HERO_SPACE.doorWidth / 2) * SCALE}
            y1={d}
            x2={(HERO_SPACE.width / 2 + HERO_SPACE.doorWidth / 2) * SCALE}
            y2={d}
            className="stroke-primary"
            strokeWidth={8}
            strokeLinecap="round"
          />

          {scanning ? (
            <rect
              x={0}
              y={0}
              width={w}
              height={6}
              className="fill-primary opacity-70"
              style={{
                animation: "sp-scan 1.6s var(--ease-out-soft) infinite",
                ["--sp-scan-distance" as string]: `${d - 6}px`,
              }}
            />
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-card/90 px-3 py-2 backdrop-blur">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              organised ? "bg-primary" : "bg-primary motion-safe:animate-twinkle",
            )}
          />
          <p key={frame} className="min-w-0 truncate type-badge text-foreground animate-fade">
            {FRAMES[frame]!.label}
          </p>
        </div>
      </div>

      <dl className="relative mt-3 grid grid-cols-3 gap-2">
        <Stat label="Estimated fit" value={`${plan.metrics.utilisation}%`} on={organised} />
        <Stat label="Walkway" value={plan.after.walkway ? "Kept clear" : "Not needed"} on={organised} />
        <Stat
          label="Free space"
          value={`~${plan.metrics.remainingCapacity.toFixed(1)}m³`}
          on={organised}
        />
      </dl>
    </div>
  );
}

function Stat({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 transition-colors duration-500",
        on ? "bg-primary-soft/60" : "bg-surface",
      )}
    >
      <dt className="type-overline text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate type-label">{on ? value : "—"}</dd>
    </div>
  );
}
