/**
 * InventorySummary — what Vision AI believes it is looking at, in totals.
 */
import { Boxes, Layers, Scale, ShieldAlert, Sofa } from "lucide-react";

import { formatVolume, formatWeight } from "@/lib/spaceplanner/library";
import { formatConfidence, type DetectedInventorySummary } from "@/lib/vision";

export function InventorySummary({ summary }: { summary: DetectedInventorySummary }) {
  const tiles = [
    { icon: Layers, label: "Detected objects", value: String(summary.itemCount) },
    { icon: Boxes, label: "Estimated volume", value: formatVolume(summary.volumeM3) },
    { icon: Scale, label: "Estimated weight", value: formatWeight(summary.weightKg) },
    { icon: ShieldAlert, label: "Fragile items", value: String(summary.fragileCount) },
    { icon: Sofa, label: "Furniture", value: String(summary.furnitureCount) },
    { icon: Boxes, label: "Boxes", value: String(summary.boxCount) },
  ];

  return (
    <div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 type-label text-muted-foreground">
              <tile.icon className="size-3.5" aria-hidden="true" />
              {tile.label}
            </p>
            <p className="mt-0.5 type-h4 tabular-nums">{tile.value}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 type-body-xs text-muted-foreground">
        Average AI confidence {formatConfidence(summary.averageConfidence)}. Estimates, not
        measurements.
      </p>
    </div>
  );
}
