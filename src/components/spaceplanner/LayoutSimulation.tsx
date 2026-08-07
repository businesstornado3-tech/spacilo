/**
 * Illustrated plan view of a packed space.
 *
 * The geometry is the engine's, unaltered: 1 metre = 100 SVG units. Every
 * placement is drawn as the real object it represents — bike, boxes, mattress,
 * wardrobe — on a warm timber floor, so a visitor recognises their own garage
 * rather than reading a CAD drawing. Items move between the naive and
 * optimised passes with a compositor-only transform.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { SceneObject } from "@/components/spaceplanner/ObjectArt";
import type { PackResult, StorageSpace, IconKey } from "@/lib/spaceplanner";

const SCALE = 100;

export interface LayoutSimulationProps {
  space: StorageSpace;
  pack: PackResult;
  /** Staggered entrance for the optimised pass. */
  animate?: boolean;
  showLabels?: boolean;
  /** Hide the caption row (used by stacked comparison layers). */
  showCaption?: boolean;
  title: string;
  className?: string;
}

export function LayoutSimulation({
  space,
  pack,
  animate = true,
  showLabels = true,
  showCaption = true,
  title,
  className,
}: LayoutSimulationProps) {
  const w = space.width * SCALE;
  const d = space.depth * SCALE;
  // Match the panel to the room's real proportions so the scene fills the frame.
  const ratio = Math.min(1.7, Math.max(0.5, space.width / space.depth));

  return (
    <figure className={cn("min-w-0", className)}>
      <svg
        viewBox={`-10 -10 ${w + 20} ${d + 20}`}
        style={{ aspectRatio: ratio }}
        className="mx-auto w-full max-h-[26rem] rounded-2xl bg-scene-wall"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${title}: plan view of a ${space.name} with ${pack.placements.length} placed groups`}
      >
        <defs>
          <pattern id="sp-boards" width="200" height="46" patternUnits="userSpaceOnUse">
            <rect width="200" height="46" className="fill-scene-floor" />
            <path d="M0 46h200" className="stroke-scene-floor-line" strokeWidth={1.4} fill="none" />
            <path
              d="M60 0v46M150 0v46"
              className="stroke-scene-floor-line"
              strokeWidth={1.2}
              fill="none"
            />
          </pattern>
        </defs>

        <rect x={0} y={0} width={w} height={d} rx={12} fill="url(#sp-boards)" />
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

        {pack.walkway ? (
          <g>
            <rect
              x={pack.walkway.x * SCALE}
              y={pack.walkway.y * SCALE}
              width={pack.walkway.w * SCALE}
              height={pack.walkway.d * SCALE}
              rx={10}
              className="fill-primary-soft opacity-80"
            />
            <text
              x={(pack.walkway.x + pack.walkway.w / 2) * SCALE}
              y={(pack.walkway.y + pack.walkway.d / 2) * SCALE + 6}
              textAnchor="middle"
              className="fill-primary-soft-foreground"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              Walkway
            </text>
          </g>
        ) : null}

        {/* The opening */}
        <line
          x1={(space.width / 2 - space.doorWidth / 2) * SCALE}
          y1={d}
          x2={(space.width / 2 + space.doorWidth / 2) * SCALE}
          y2={d}
          className="stroke-primary"
          strokeWidth={8}
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
          />
        ))}
      </svg>

      {showCaption ? (
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
      ) : null}
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
}: {
  index: number;
  animate: boolean;
  showLabel: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  icon: IconKey;
  label: string;
  units: number;
  level: number;
  fragile: boolean;
}) {
  const compact = Math.min(w, h) < 40;
  const [entered, setEntered] = React.useState(!animate);

  React.useEffect(() => {
    if (!animate) return setEntered(true);
    const id = window.setTimeout(() => setEntered(true), 40 + index * 70);
    return () => window.clearTimeout(id);
  }, [animate, index]);

  return (
    <g
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className="transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    >
      <g
        style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}
        className={cn(
          "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          entered ? "scale-100 opacity-100" : "scale-90 opacity-0 motion-reduce:opacity-100",
        )}
      >
        {/* soft ground shadow so objects sit on the floor */}
        <rect
          x={2.5}
          y={4}
          width={Math.max(w - 5, 4)}
          height={Math.max(h - 5, 4)}
          rx={10}
          className="fill-scene-ink opacity-[0.09]"
        />
        <rect
          width={w}
          height={h}
          rx={10}
          className={cn(
            "stroke-scene-line",
            level > 0 ? "fill-scene-wall opacity-95" : "fill-scene-wall",
          )}
          strokeWidth={1.5}
        />

        <SceneObject icon={icon} x={0} y={0} w={w} h={showLabel && !compact ? h - 14 : h} />

        {level > 0 ? (
          <rect
            x={5}
            y={5}
            width={Math.max(w - 10, 4)}
            height={Math.max(h - 10, 4)}
            rx={8}
            fill="none"
            className="stroke-primary/45"
            strokeDasharray="7 6"
            strokeWidth={1.5}
          />
        ) : null}

        {fragile ? (
          <circle
            cx={w - 11}
            cy={11}
            r={6}
            className="fill-warning-soft stroke-warning"
            strokeWidth={1.4}
          />
        ) : null}

        {showLabel && !compact ? (
          <text
            x={w / 2}
            y={h - 7}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: Math.min(15, Math.max(10, w / 7)), fontWeight: 600 }}
          >
            {units > 1 ? `${units}× ` : ""}
            {label}
          </text>
        ) : null}
      </g>
    </g>
  );
}
