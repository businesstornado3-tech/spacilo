/**
 * The looping hero demonstration.
 *
 * Five frames — inventory, analysis, layout, utilisation, finished plan —
 * built from the same deterministic engine the interactive demo uses, so the
 * hero can never show a plan the product would not produce.
 *
 * Motion is limited to `transform` and `opacity` (compositor-only) and stops
 * entirely for `prefers-reduced-motion`, where the finished plan is shown.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import { iconFor } from "@/components/spaceplanner/icons";
import { buildPlan, CATALOGUE_BY_ID, SPACE_BY_ID, type InventoryLine } from "@/lib/spaceplanner";

const FRAME_MS = 2600;

const HERO_LINES: InventoryLine[] = [
  { item: CATALOGUE_BY_ID.get("medium-box")!, quantity: 6 },
  { item: CATALOGUE_BY_ID.get("bicycle")!, quantity: 1 },
  { item: CATALOGUE_BY_ID.get("mattress")!, quantity: 1 },
  { item: CATALOGUE_BY_ID.get("suitcase")!, quantity: 2 },
  { item: CATALOGUE_BY_ID.get("television")!, quantity: 1 },
];

const HERO_SPACE = SPACE_BY_ID.get("garage")!;

const STAGES = [
  { id: "inventory", label: "Inventory" },
  { id: "analysis", label: "AI analysis" },
  { id: "layout", label: "Layout optimisation" },
  { id: "utilisation", label: "Space utilisation" },
  { id: "plan", label: "Finished plan" },
] as const;

export function HeroAnimation({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = React.useState(reduced ? STAGES.length - 1 : 0);
  const plan = React.useMemo(() => buildPlan(HERO_LINES, HERO_SPACE), []);

  React.useEffect(() => {
    if (reduced) {
      setFrame(STAGES.length - 1);
      return;
    }
    let timer = 0;
    const tick = () => {
      setFrame((f) => (f + 1) % STAGES.length);
      timer = window.setTimeout(tick, FRAME_MS);
    };
    timer = window.setTimeout(tick, FRAME_MS);
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else timer = window.setTimeout(tick, FRAME_MS);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const showPlacements = frame >= 2;
  const scale = 100;
  const w = HERO_SPACE.width * scale;
  const d = HERO_SPACE.depth * scale;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-raised sm:p-5",
        className,
      )}
      aria-label="Looping illustration of Spacilo AI planning a single garage"
      role="img"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_80%_0%,var(--color-signal-soft),transparent_60%)] opacity-70" />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
          <span className="size-1.5 rounded-full bg-signal motion-safe:animate-twinkle" />
          Spacilo AI SpacePlanner
        </span>
        <span className="type-badge text-muted-foreground">{HERO_SPACE.name}</span>
      </div>

      <div className="relative mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
        <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-surface">
          <svg
            viewBox={`-8 -8 ${w + 16} ${d + 16}`}
            className="size-full"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <rect
              x={0}
              y={0}
              width={w}
              height={d}
              rx={10}
              className="fill-card stroke-border-strong"
              strokeWidth={2}
            />
            {plan.after.walkway ? (
              <rect
                x={plan.after.walkway.x * scale}
                y={plan.after.walkway.y * scale}
                width={plan.after.walkway.w * scale}
                height={plan.after.walkway.d * scale}
                className={cn(
                  "fill-signal-soft transition-opacity duration-500",
                  frame >= 3 ? "opacity-100" : "opacity-0",
                )}
              />
            ) : null}

            {plan.after.placements.map((p, index) => (
              <g
                key={p.key}
                style={{
                  transform: `translate(${p.x * scale}px, ${(showPlacements ? p.y : HERO_SPACE.depth - 0.6) * scale}px)`,
                  transitionDelay: `${index * 45}ms`,
                }}
                className="transition-transform duration-700 ease-out motion-reduce:transition-none"
              >
                <rect
                  width={p.w * scale}
                  height={p.d * scale}
                  rx={7}
                  className={cn(
                    "transition-opacity duration-500",
                    p.fragile
                      ? "fill-warning-soft stroke-warning"
                      : p.weight === "heavy"
                        ? "fill-secondary stroke-border-strong"
                        : "fill-primary-soft stroke-primary/50",
                    showPlacements ? "opacity-100" : "opacity-0",
                  )}
                  strokeWidth={1.5}
                />
              </g>
            ))}

            {frame === 1 ? (
              <rect
                x={0}
                y={0}
                width={w}
                height={6}
                className="fill-signal opacity-80"
                style={{
                  animation: "sp-scan 1.6s var(--ease-out-soft) infinite",
                  ["--sp-scan-distance" as string]: `${d - 6}px`,
                }}
              />
            ) : null}
          </svg>

          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            <p className="rounded-xl bg-card/90 px-3 py-2 type-badge text-muted-foreground backdrop-blur">
              {STAGES[frame]!.label}
            </p>
          </div>
        </div>

        <ol className="flex gap-2 overflow-hidden sm:flex-col">
          {STAGES.map((stage, index) => (
            <li key={stage.id} className="min-w-0 flex-1">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors duration-500",
                  index <= frame ? "bg-signal" : "bg-border",
                )}
              />
              <p
                className={cn(
                  "mt-1.5 hidden truncate type-badge transition-colors sm:block",
                  index === frame ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {stage.label}
              </p>
            </li>
          ))}
          <li className="hidden rounded-xl bg-surface p-3 sm:block">
            <p className="type-overline text-muted-foreground">Estimated fit</p>
            <p className="mt-1 type-price text-foreground">{plan.metrics.utilisation}%</p>
            <p className="mt-1 type-badge text-muted-foreground">
              ~{plan.metrics.remainingCapacity.toFixed(1)}m³ free
            </p>
          </li>
        </ol>
      </div>

      <p className="relative mt-3 type-badge text-muted-foreground">
        Illustrative estimate from the same planner you can try below.
      </p>
    </div>
  );
}
