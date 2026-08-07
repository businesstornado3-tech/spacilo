/**
 * PlanPreview — the small deterministic thumbnail of a saved plan.
 *
 * Runs the same engine as the full planner and draws the resulting footprint
 * at thumbnail scale. No stored image, no snapshot to go stale: the preview is
 * always the plan the engine would produce today.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { buildPlan } from "@/lib/spaceplanner";
import { spaceFor, toLines, type SavedInventory } from "@/lib/spaceplanner/library";

export interface PlanPreviewProps {
  inventory: SavedInventory;
  className?: string;
}

export function PlanPreview({ inventory, className }: PlanPreviewProps) {
  const space = spaceFor(inventory);
  const lines = React.useMemo(() => toLines(inventory.lines), [inventory.lines]);
  const plan = React.useMemo(
    () => (lines.length ? buildPlan(lines, space) : null),
    [lines, space],
  );

  const scale = 12;
  const w = space.width * scale;
  const d = space.depth * scale;

  return (
    <div
      className={cn(
        "grid aspect-4/3 place-items-center overflow-hidden rounded-xl border border-border bg-secondary/50 p-2",
        className,
      )}
    >
      <svg
        viewBox={`-2 -2 ${w + 4} ${d + 4}`}
        className="size-full"
        role="img"
        aria-label={`Plan preview of ${inventory.name} in a ${space.name.toLowerCase()}`}
      >
        <rect
          x={0}
          y={0}
          width={w}
          height={d}
          rx={2}
          className="fill-card stroke-border-strong"
          strokeWidth={0.8}
        />
        {plan?.after.walkway ? (
          <rect
            x={plan.after.walkway.x * scale}
            y={plan.after.walkway.y * scale}
            width={plan.after.walkway.w * scale}
            height={plan.after.walkway.d * scale}
            className="fill-primary-soft"
            opacity={0.5}
          />
        ) : null}
        {(plan?.after.placements ?? []).map((placement) => (
          <rect
            key={placement.key}
            x={placement.x * scale}
            y={placement.y * scale}
            width={Math.max(1, placement.w * scale - 0.6)}
            height={Math.max(1, placement.d * scale - 0.6)}
            rx={1}
            className="fill-primary"
            opacity={placement.level > 0 ? 0.62 : 0.88}
          />
        ))}
        <line
          x1={(space.width / 2 - space.doorWidth / 2) * scale}
          y1={d}
          x2={(space.width / 2 + space.doorWidth / 2) * scale}
          y2={d}
          className="stroke-signal"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
