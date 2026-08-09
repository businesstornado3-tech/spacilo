/**
 * SpaceScanSummary — what Spacilo AI believes a host's space is worth holding.
 *
 * Estimates only: usable area, dimensions, suitability and indicative income.
 * The host always sets their own price.
 */
import { AlertTriangle, Sparkles } from "lucide-react";

import { DimensionCard } from "@/components/vision/DimensionCard";
import { ConfidenceBadge } from "@/components/vision/ConfidenceBadge";
import { formatMoney, type SpaceValueEstimate } from "@/lib/vision";
import type { SpaceScanResult } from "@/lib/vision";
import { validateRoomGeometry } from "@/lib/spaceplanner/room-geometry";

const SUITABILITY_COPY: Record<SpaceScanResult["suitability"], string> = {
  excellent: "Excellent for household storage",
  good: "Good for boxes and medium furniture",
  limited: "Best for smaller, boxed belongings",
};

export function SpaceScanSummary({
  scan,
  estimate,
}: {
  scan: SpaceScanResult;
  estimate: SpaceValueEstimate;
}) {
  // Phase 6Q — measurements from photographs are estimates. When they look
  // physically implausible the user is told, rather than being handed a plan
  // built on a room that cannot exist.
  const geometry = validateRoomGeometry({
    roomWidthM: scan.roomWidthM ?? scan.widthM,
    roomDepthM: scan.roomDepthM ?? scan.depthM,
    roomHeightM: scan.ceilingHeightM,
    usableWidthM: scan.widthM,
    usableDepthM: scan.depthM,
    basis: scan.usableIsSubArea ? "photo-usable-area" : "photo-room",
    confidence: scan.confidence,
  });

  return (
    <section
      aria-label="Space scan result"
      className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <p className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Spacilo AI analysed your space
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DimensionCard
          label="Estimated usable storage"
          value={`${scan.usableAreaM2}m²`}
          hint={`${scan.widthM}m × ${scan.depthM}m`}
        />
        <DimensionCard
          label="Ceiling height"
          value={`${scan.ceilingHeightM}m`}
          hint={`≈${scan.usableVolumeM3}m³ usable`}
        />
        <DimensionCard
          label="Potential monthly income"
          value={`${formatMoney(estimate.monthlyTypical)}/month`}
          hint={`${formatMoney(estimate.annualTypical)} a year`}
        />
        <DimensionCard
          label="Recommended listing price"
          value={`${formatMoney(estimate.weeklyPrice)}/week`}
          hint={`Demand: ${estimate.demand}`}
        />
      </div>

      <ul className="mt-4 space-y-1">
        <li className="type-body-sm">{SUITABILITY_COPY[scan.suitability]}</li>
        {scan.observations.map((observation) => (
          <li key={observation} className="type-body-sm text-muted-foreground">
            {observation}
          </li>
        ))}
      </ul>

      {geometry.issues.length > 0 ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3"
        >
          <p className="inline-flex items-center gap-2 type-label text-warning-soft-foreground">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Check these measurements
          </p>
          <ul className="mt-1 space-y-1">
            {geometry.issues.map((issue) => (
              <li key={issue.code} className="type-body-sm text-warning-soft-foreground">
                {issue.message}
              </li>
            ))}
          </ul>
          {geometry.needsConfirmation ? (
            <p className="mt-2 type-body-sm text-warning-soft-foreground">
              Enter the room's real dimensions to get an accurate plan.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={scan.confidence} />
        <span className="type-body-xs text-muted-foreground">
          {estimate.basis}. Estimates only — you set your own price when you list.
        </span>
      </div>
    </section>
  );
}
