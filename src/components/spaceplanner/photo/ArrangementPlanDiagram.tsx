/**
 * Phase 6J — the deterministic arrangement plan.
 *
 * This is the fallback that means a failed photographic render can never make
 * SpacePlanner look broken. It draws the placement manifest exactly as the
 * physical engine decided it: a top-down floor plan, in metres, with the
 * access corridor kept clear and every unit labelled. Nothing here is
 * generated — it is a direct drawing of the plan the user's numbers came from.
 */
import * as React from "react";

import type { PlacementManifest } from "@/lib/spaceplanner/photo/manifest";
import { manifestHash } from "@/lib/spaceplanner/photo/diagnostics";

const PAD = 0.25;

export function ArrangementPlanDiagram({
  manifest,
  className,
}: {
  manifest: PlacementManifest;
  className?: string;
}) {
  const width = manifest.spaceWidthM;
  const depth = manifest.spaceDepthM;

  const units = manifest.entries.flatMap((entry) =>
    entry.positions.map((position, index) => ({
      key: `${entry.id}-${index}`,
      label: entry.label,
      ...position,
    })),
  );
  const unplaced = manifest.entries.filter((entry) => entry.state === "cannot be safely placed");

  return (
    <div className={className}>
      <svg
        viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${depth + PAD * 2}`}
        className="w-full rounded-2xl border border-border bg-surface"
        role="img"
        aria-label={`Top-down arrangement plan: ${units.length} placed items in a ${width}m by ${depth}m space.`}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={depth}
          className="fill-card stroke-border"
          strokeWidth={0.04}
        />

        {manifest.walkway ? (
          <rect
            x={manifest.walkway.xM}
            y={manifest.walkway.yM}
            width={manifest.walkway.widthM}
            height={manifest.walkway.depthM}
            className="fill-signal-soft/60 stroke-signal"
            strokeDasharray="0.12 0.12"
            strokeWidth={0.03}
          />
        ) : null}

        {units.map((unit) => (
          <g key={unit.key}>
            <rect
              x={unit.xM}
              y={unit.yM}
              width={unit.widthM}
              height={unit.depthM}
              rx={0.04}
              className="fill-signal/35 stroke-signal"
              strokeWidth={0.03}
            />
            <text
              x={unit.xM + unit.widthM / 2}
              y={unit.yM + unit.depthM / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.max(0.12, Math.min(0.2, unit.widthM / 5))}
              className="fill-foreground"
            >
              {unit.label}
            </text>
          </g>
        ))}

        <text
          x={width / 2}
          y={depth + PAD * 0.7}
          textAnchor="middle"
          fontSize={0.16}
          className="fill-muted-foreground"
        >
          Entrance side
        </text>
      </svg>

      <dl className="mt-3 grid gap-2 type-body-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt>Items placed</dt>
          <dd className="font-medium text-foreground">
            {units.length} of {manifest.expectedUnits}
          </dd>
        </div>
        <div>
          <dt>Walkway kept clear</dt>
          <dd className="font-medium text-foreground">
            {manifest.walkway ? `${manifest.walkway.widthM.toFixed(2)}m` : "Full floor used"}
          </dd>
        </div>
        <div>
          <dt>Plan reference</dt>
          <dd className="break-all font-mono text-foreground">{manifestHash(manifest)}</dd>
        </div>
      </dl>

      {unplaced.length > 0 ? (
        <p className="mt-2 type-body-xs text-warning">
          Could not be safely placed: {unplaced.map((entry) => entry.label).join(", ")}.
        </p>
      ) : null}

      <p className="mt-2 type-body-xs text-muted-foreground">
        Estimated plan drawn from your confirmed inventory and space — positions are estimates, not
        measurements.
      </p>
    </div>
  );
}

export default ArrangementPlanDiagram;
