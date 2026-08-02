import { Boxes, Ruler, Maximize, CircleCheck, TriangleAlert, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ALLOWANCE_EXPLAINER,
  formatDimensions,
  formatVolume,
  type InventoryTotals,
  type LargestItem,
  type Readiness,
} from "@/lib/inventory-model";

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-3 type-body-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 type-h3">{value}</p>
      {detail ? <p className="mt-0.5 type-body-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** Headline figures for My Stuff. All maths comes from inventory-model. */
export function InventorySummary({
  totals,
  largest,
  readiness,
  className,
}: {
  totals: InventoryTotals;
  largest: LargestItem | null;
  readiness: Readiness;
  className?: string;
}) {
  const ReadyIcon =
    readiness.level === "ready" ? CircleCheck : readiness.level === "partial" ? TriangleAlert : Info;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Boxes} label="Items" value={String(totals.itemCount)} />
        <Stat
          icon={Ruler}
          label="Estimated item volume"
          value={formatVolume(totals.itemVolumeM3)}
        />
        <Stat
          icon={Maximize}
          label="Estimated storage requirement"
          value={formatVolume(totals.storageRequirementM3, { approx: true })}
          detail="Includes a packing allowance"
        />
        <Stat
          icon={Maximize}
          label="Largest item"
          value={largest ? largest.item.item_name : "—"}
          detail={
            largest
              ? formatDimensions(largest.lengthCm, largest.widthCm, largest.heightCm)
              : "Add measurements to track this"
          }
        />
      </div>

      <div className="rounded-2xl border border-border bg-secondary/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              readiness.level === "ready" ? "success" : readiness.level === "partial" ? "warning" : "neutral"
            }
          >
            <ReadyIcon aria-hidden="true" />
            {readiness.label}
          </Badge>
          <p className="type-body-sm text-muted-foreground">{readiness.detail}</p>
        </div>
        <p className="mt-2 type-body-sm text-muted-foreground">{ALLOWANCE_EXPLAINER}</p>
      </div>
    </div>
  );
}
