/**
 * Plan-view rendering of a packed space.
 *
 * The geometry is the engine's, unaltered: 1 metre = 100 SVG units. Items move
 * between the naive and optimised passes with a compositor-only transform, so
 * the "watch it reorganise" moment stays smooth on mobile.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { iconFor } from "@/components/spaceplanner/icons";
import type { PackResult, StorageSpace } from "@/lib/spaceplanner";

const SCALE = 100;

export interface LayoutSimulationProps {
  space: StorageSpace;
  pack: PackResult;
  /** Staggered entrance for the optimised pass. */
  animate?: boolean;
  showLabels?: boolean;
  title: string;
  className?: string;
}

export function LayoutSimulation({
  space,
  pack,
  animate = true,
  showLabels = true,
  title,
  className,
}: LayoutSimulationProps) {
  const w = space.width * SCALE;
  const d = space.depth * SCALE;

  return (
    <figure className={cn("min-w-0", className)}>
      <svg
        viewBox={`-10 -10 ${w + 20} ${d + 20}`}
        className="aspect-4/3 w-full rounded-2xl bg-surface"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${title}: plan view of a ${space.name} with ${pack.placements.length} placed groups`}
      >
        <defs>
          <pattern id="sp-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" className="stroke-border" strokeWidth={1} />
          </pattern>
        </defs>

        <rect x={0} y={0} width={w} height={d} rx={12} fill="url(#sp-grid)" />
        <rect
          x={0}
          y={0}
          width={w}
          height={d}
          rx={12}
          fill="none"
          className="stroke-border-strong"
          strokeWidth={2.5}
        />

        {pack.walkway ? (
          <g>
            <rect
              x={pack.walkway.x * SCALE}
              y={pack.walkway.y * SCALE}
              width={pack.walkway.w * SCALE}
              height={pack.walkway.d * SCALE}
              className="fill-signal-soft opacity-70"
            />
            <text
              x={(pack.walkway.x + pack.walkway.w / 2) * SCALE}
              y={(pack.walkway.y + pack.walkway.d / 2) * SCALE + 6}
              textAnchor="middle"
              className="fill-signal-soft-foreground"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              Access
            </text>
          </g>
        ) : null}

        {/* The opening */}
        <line
          x1={(space.width / 2 - space.doorWidth / 2) * SCALE}
          y1={d}
          x2={(space.width / 2 + space.doorWidth / 2) * SCALE}
          y2={d}
          className="stroke-signal"
          strokeWidth={7}
          strokeLinecap="round"
        />

        {pack.placements.map((p, index) => (
          <PlacementShape
            key={p.key}
            index={index}
            animate={animate}
            showLabel={showLabels}
            x={p.x * SCALE}
            y={p.y * SCALE}
            w={p.w * SCALE}
            h={p.d * SCALE}
            icon={p.icon}
            label={p.label}
            units={p.units}
            level={p.level}
            fragile={p.fragile}
            heavy={p.weight === "heavy"}
          />
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 type-badge text-muted-foreground">
        <span className="type-label text-foreground">{title}</span>
        <span>{pack.floorAreaUsed.toFixed(1)}m² floor used</span>
        {pack.stackedUnits > 0 ? <span>{pack.stackedUnits} items stacked</span> : null}
        {pack.unplaced.length > 0 ? (
          <span className="text-warning-soft-foreground">
            {pack.unplaced.length} item{pack.unplaced.length === 1 ? "" : "s"} left over
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

function PlacementShape({
  index,
  animate,
  showLabel,
  x,
  y,
  w,
  h,
  icon,
  label,
  units,
  level,
  fragile,
  heavy,
}: {
  index: number;
  animate: boolean;
  showLabel: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  icon: Parameters<typeof iconFor>[0];
  label: string;
  units: number;
  level: number;
  fragile: boolean;
  heavy: boolean;
}) {
  const Icon = iconFor(icon);
  const compact = Math.min(w, h) < 34;
  const [entered, setEntered] = React.useState(!animate);

  React.useEffect(() => {
    if (!animate) return setEntered(true);
    const id = window.setTimeout(() => setEntered(true), 40 + index * 55);
    return () => window.clearTimeout(id);
  }, [animate, index]);

  return (
    <g
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className="transition-transform duration-500 ease-out motion-reduce:transition-none"
    >
      <g
        style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}
        className={cn(
          "transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
          entered ? "scale-100 opacity-100" : "scale-90 opacity-0 motion-reduce:opacity-100",
        )}
      >
        <rect
          width={w}
          height={h}
          rx={8}
          className={cn(
            fragile
              ? "fill-warning-soft stroke-warning"
              : heavy
                ? "fill-secondary stroke-border-strong"
                : "fill-primary-soft stroke-primary/45",
          )}
          strokeWidth={1.75}
        />
        {level > 0 ? (
          <rect
            x={4}
            y={4}
            width={Math.max(w - 8, 4)}
            height={Math.max(h - 8, 4)}
            rx={6}
            fill="none"
            className="stroke-foreground/25"
            strokeDasharray="6 5"
            strokeWidth={1.25}
          />
        ) : null}

        {!compact ? (
          <>
            <Icon
              x={w / 2 - 11}
              y={h / 2 - (showLabel ? 20 : 11)}
              width={22}
              height={22}
              className="text-foreground/70"
              aria-hidden="true"
            />
            {showLabel ? (
              <>
                <text
                  x={w / 2}
                  y={h / 2 + 12}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: Math.min(15, Math.max(9, w / 6)), fontWeight: 600 }}
                >
                  {units > 1 ? `${units}× ` : ""}
                  {label}
                </text>
                {level > 0 ? (
                  <text
                    x={w / 2}
                    y={h / 2 + 28}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 13 }}
                  >
                    stacked
                  </text>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 5} className="fill-foreground/25" />
        )}
      </g>
    </g>
  );
}
