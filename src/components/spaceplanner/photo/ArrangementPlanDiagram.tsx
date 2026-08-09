/**
 * Phase 6J/6O — the deterministic arrangement plan.
 *
 * This is the fallback that means a failed photographic render can never make
 * SpacePlanner look broken. It draws the placement manifest exactly as the
 * physical engine decided it: a top-down floor plan, in metres, with the
 * access corridor kept clear. Nothing here is generated — it is a direct
 * drawing of the plan the user's numbers came from.
 *
 * Phase 6O fixes readability without touching geometry: labels are laid out by
 * `plan-labels`, which fits a short name inside an object only when it can be
 * drawn at a readable size without colliding with another label. Everything
 * else becomes a numbered marker, and the legend carries the full names. An
 * object is never resized to make its text fit.
 */
import * as React from "react";

import type { PlacementManifest } from "@/lib/spaceplanner/photo/manifest";
import { manifestHash } from "@/lib/spaceplanner/photo/diagnostics";
import {
  layoutPlanLabels,
  legendFor,
  type PlanUnit,
} from "@/lib/spaceplanner/photo/plan-labels";

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

  const units: PlanUnit[] = manifest.entries.flatMap((entry) =>
    entry.positions.map((position, index) => ({
      key: `${entry.id}-${index}`,
      entryId: entry.id,
      label: entry.label,
      xM: position.xM,
      yM: position.yM,
      widthM: position.widthM,
      depthM: position.depthM,
    })),
  );

  const { numbers, legend } = React.useMemo(
    () => legendFor(manifest.entries.map((e) => ({ id: e.id, label: e.label, state: e.state }))),
    [manifest.entries],
  );
  const labels = React.useMemo(() => layoutPlanLabels(units, numbers), [units, numbers]);
  const labelByKey = new Map(labels.map((label) => [label.key, label]));
  const unplaced = legend.filter((entry) => !entry.placed);

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

        {units.map((unit) => {
          const label = labelByKey.get(unit.key);
          return (
            <g key={unit.key}>
              {/* Geometry is the manifest's, never adjusted to fit text. */}
              <rect
                x={unit.xM}
                y={unit.yM}
                width={unit.widthM}
                height={unit.depthM}
                rx={0.04}
                className="fill-signal/35 stroke-signal"
                strokeWidth={0.03}
              />
              {label?.mode === "marker" ? (
                <>
                  <circle
                    cx={label.x}
                    cy={label.y}
                    r={label.fontSize * 0.75}
                    className="fill-card stroke-signal"
                    strokeWidth={0.02}
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={label.fontSize}
                    className="fill-foreground tabular-nums"
                  >
                    {label.text}
                  </text>
                </>
              ) : label ? (
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={label.fontSize}
                  className="fill-foreground"
                >
                  {label.number}. {label.text}
                </text>
              ) : null}
            </g>
          );
        })}

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

      <div className="mt-3">
        <p className="type-overline text-muted-foreground">What is what</p>
        <ol className="mt-1 grid gap-x-4 gap-y-1 type-body-xs sm:grid-cols-2">
          {legend.map((entry) => (
            <li key={entry.entryId} className="flex gap-2">
              <span className="tabular-nums font-medium text-foreground">{entry.number}</span>
              <span className={entry.placed ? "text-muted-foreground" : "text-warning"}>
                {entry.label}
                {entry.placed ? "" : " — not safely placed"}
              </span>
            </li>
          ))}
        </ol>
      </div>

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
          <dt>Access route</dt>
          <dd className="font-medium text-foreground">{manifest.corridorSide}</dd>
        </div>
        <div>
          <dt>Packing approach</dt>
          <dd className="font-medium text-foreground">{manifest.strategy}</dd>
        </div>
        <div>
          <dt>Arrangement score</dt>
          <dd className="font-medium text-foreground">{manifest.qualityScore}/100</dd>
        </div>
        <div>
          <dt>Plan reference</dt>
          <dd className="break-all font-mono text-foreground">
            {manifest.planHash || manifestHash(manifest)}
          </dd>
        </div>
      </dl>

      {unplaced.length > 0 ? (
        <p className="mt-2 type-body-xs text-warning">
          Could not be safely placed:{" "}
          {unplaced.map((entry) => `${entry.number}. ${entry.label}`).join(", ")}.
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
