/**
 * PlanScene — the reusable EarnRoom AI storage scene.
 *
 * Plan view of a real room: timber-and-concrete floor, back-wall shelving, the
 * opening, the access strip and every belonging drawn as its own illustration.
 * It renders whatever `SpacePlan` it is handed, so the same component serves
 * the public homepage today and the authenticated planner, Digital Twin and AR
 * previews later.
 *
 * Motion is compositor-only (`transform`/`opacity`) and stops entirely under
 * `prefers-reduced-motion`, where the finished layout is shown immediately.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { SceneObject } from "@/components/spaceplanner/ObjectArt";
import {
  placementReason,
  type PackResult,
  type Placement,
  type StorageSpace,
} from "@/lib/spaceplanner";

const SCALE = 100;

export interface PlanSceneProps {
  space: StorageSpace;
  /** The layout being shown. */
  pack: PackResult;
  /** Where objects travel from when `organised` flips to true. */
  from?: PackResult | null;
  organised?: boolean;
  /** Slightly darkens the room while the planner reasons. */
  thinking?: boolean;
  /** Enables hover/focus explanations. */
  explain?: boolean;
  /** Called with a catalogue id when an object is dropped into the room. */
  onAdd?: (itemId: string) => void;
  className?: string;
  label: string;
}

export function PlanScene({
  space,
  pack,
  from = null,
  organised = true,
  thinking = false,
  explain = false,
  onAdd,
  className,
  label,
}: PlanSceneProps) {
  const [active, setActive] = React.useState<Placement | null>(null);
  const [dropping, setDropping] = React.useState(false);

  const w = space.width * SCALE;
  const d = space.depth * SCALE;
  const start = React.useMemo(
    () => new Map((from?.placements ?? []).map((p) => [p.key, p])),
    [from],
  );

  React.useEffect(() => {
    if (!organised) setActive(null);
  }, [organised]);

  return (
    <div className={cn("min-w-0", className)}>
      <div
        style={{ width: `min(100%, calc(28rem * ${(space.width / space.depth).toFixed(3)}))` }}
        className={cn(
          "relative mx-auto overflow-hidden rounded-2xl bg-scene-wall transition-shadow duration-500",
          dropping && "ring-2 ring-primary",
        )}
        {...(onAdd
          ? {
              onDragOver: (event: React.DragEvent) => {
                event.preventDefault();
                setDropping(true);
              },
              onDragLeave: () => setDropping(false),
              onDrop: (event: React.DragEvent) => {
                event.preventDefault();
                setDropping(false);
                const itemId = event.dataTransfer.getData("text/plain");
                if (itemId) onAdd(itemId);
              },
            }
          : {})}
      >
        <svg
          viewBox={`-10 -10 ${w + 20} ${d + 20}`}
          style={{ aspectRatio: Math.max(0.55, space.width / space.depth) }}
          className="mx-auto max-h-[28rem] w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={label}
        >
          <defs>
            <pattern id="plan-floor" width="210" height="48" patternUnits="userSpaceOnUse">
              <rect width="210" height="48" className="fill-scene-floor" />
              <path
                d="M0 48h210"
                className="stroke-scene-floor-line"
                strokeWidth={1.4}
                fill="none"
              />
              <path
                d="M74 0v48M168 0v48"
                className="stroke-scene-floor-line"
                strokeWidth={1.2}
                fill="none"
              />
            </pattern>
            <linearGradient id="plan-daylight" x1="0.9" y1="0" x2="0.1" y2="1">
              <stop offset="0%" stopColor="var(--color-scene-wall)" stopOpacity="0.85" />
              <stop offset="60%" stopColor="var(--color-scene-wall)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* room shell */}
          <rect x={0} y={0} width={w} height={d} rx={14} fill="url(#plan-floor)" />
          <rect
            x={0}
            y={0}
            width={w}
            height={d}
            rx={14}
            fill="none"
            className="stroke-scene-wood-dark"
            strokeWidth={3}
          />

          {/* access strip */}
          {pack.walkway ? (
            <rect
              x={pack.walkway.x * SCALE}
              y={pack.walkway.y * SCALE}
              width={pack.walkway.w * SCALE}
              height={pack.walkway.d * SCALE}
              rx={12}
              className={cn(
                "fill-primary-soft transition-opacity duration-700",
                organised ? "opacity-90" : "opacity-0",
              )}
            />
          ) : null}

          {/* belongings */}
          {pack.placements.map((p, index) => {
            const origin = organised ? p : (start.get(p.key) ?? p);
            const focused = active?.key === p.key;
            return (
              <g
                key={p.key}
                style={{
                  transform: `translate(${origin.x * SCALE}px, ${origin.y * SCALE}px)`,
                  transitionDelay: `${index * 85}ms`,
                }}
                className="transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                {...(explain
                  ? {
                      tabIndex: 0,
                      role: "button" as const,
                      "aria-label": `${p.label}. ${placementReason(p, space)}`,
                      className:
                        "cursor-help outline-none transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                      onPointerEnter: () => setActive(p),
                      onPointerLeave: () => setActive(null),
                      onFocus: () => setActive(p),
                      onBlur: () => setActive(null),
                    }
                  : {})}
              >
                <rect
                  x={2.5}
                  y={4}
                  width={Math.max(origin.w * SCALE - 5, 4)}
                  height={Math.max(origin.d * SCALE - 5, 4)}
                  rx={11}
                  className="fill-scene-ink opacity-[0.09]"
                />
                <rect
                  width={origin.w * SCALE}
                  height={origin.d * SCALE}
                  rx={11}
                  className={cn(
                    "fill-scene-wall transition-[stroke,stroke-width] duration-300",
                    focused ? "stroke-primary" : "stroke-scene-line",
                  )}
                  strokeWidth={focused ? 3 : 1.5}
                />
                <SceneObject icon={p.icon} x={0} y={0} w={origin.w * SCALE} h={origin.d * SCALE} />
                {p.units > 1 ? (
                  <text
                    x={origin.w * SCALE - 12}
                    y={16}
                    textAnchor="end"
                    className="fill-scene-ink"
                    style={{ fontSize: 15, fontWeight: 700 }}
                  >
                    ×{p.units}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* the opening */}
          <line
            x1={(space.width / 2 - space.doorWidth / 2) * SCALE}
            y1={d}
            x2={(space.width / 2 + space.doorWidth / 2) * SCALE}
            y2={d}
            className="stroke-primary"
            strokeWidth={9}
            strokeLinecap="round"
          />

          {/* daylight from the opening */}
          <rect x={0} y={0} width={w} height={d} rx={14} fill="url(#plan-daylight)" opacity={0.5} />
        </svg>

        {/* ambient: a slow shaft of light and drifting dust */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -inset-y-10 left-1/4 w-1/3 -rotate-12 bg-[linear-gradient(90deg,transparent,var(--color-scene-wall),transparent)] opacity-40 motion-safe:animate-sp-daylight" />
          {DUST.map((dust, i) => (
            <span
              key={i}
              className="absolute size-[3px] rounded-full bg-scene-ink/25 motion-safe:animate-sp-dust"
              style={{
                left: dust.left,
                top: dust.top,
                animationDelay: dust.delay,
                animationDuration: dust.duration,
              }}
            />
          ))}
          <div
            className={cn(
              "absolute inset-0 bg-scene-ink transition-opacity duration-700",
              thinking ? "opacity-[0.14]" : "opacity-0",
            )}
          />
        </div>
      </div>

      {explain ? (
        <p
          aria-live="polite"
          className="mt-3 min-h-[2.75rem] rounded-xl bg-surface px-3 py-2 type-body-sm text-muted-foreground"
        >
          {active ? (
            <>
              <span className="type-label text-foreground">{active.label}: </span>
              {placementReason(active, space)}
            </>
          ) : (
            "Hover or tab through an object to see why EarnRoom AI put it there."
          )}
        </p>
      ) : null}
    </div>
  );
}

const DUST = [
  { left: "18%", top: "30%", delay: "0s", duration: "9s" },
  { left: "34%", top: "62%", delay: "1.4s", duration: "11s" },
  { left: "52%", top: "22%", delay: "2.6s", duration: "10s" },
  { left: "68%", top: "54%", delay: "0.8s", duration: "12s" },
  { left: "82%", top: "38%", delay: "3.2s", duration: "9.5s" },
];
