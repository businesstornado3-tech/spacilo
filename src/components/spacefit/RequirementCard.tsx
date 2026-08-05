/**
 * SPACEFIT ESTIMATE — what the renter's CONFIRMED belongings actually need.
 *
 * Every figure comes from `src/lib/spacefit/requirement.ts`. SpaceFit AI only
 * ever proposes items; the numbers below are deterministic maths over the
 * inventory the renter has confirmed.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Maximize, Ruler, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALLOWANCE_EXPLAINER, formatVolume, type InventoryItem } from "@/lib/inventory-model";
import {
  estimateRequiredSpace,
  REQUIREMENT_CONFIDENCE_LABEL,
  REQUIREMENT_DISCLAIMER,
} from "@/lib/spacefit/requirement";

function Figure({
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
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-2 type-body-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 type-h3 tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 type-body-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function RequirementCard({
  items,
  className,
  showAction = true,
}: {
  items: InventoryItem[];
  className?: string;
  showAction?: boolean;
}) {
  if (items.length === 0) return null;
  const requirement = estimateRequiredSpace(items);

  return (
    <section
      className={cn("rounded-2xl border border-signal/25 bg-signal-soft/30 p-5", className)}
      aria-labelledby="spacefit-estimate-heading"
    >
      <h2 id="spacefit-estimate-heading" className="flex items-center gap-2 type-h2">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        SpaceFit estimate
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Based on the {requirement.itemCount === 1 ? "item" : `${requirement.itemCount} items`}{" "}
        you&apos;ve confirmed in My Stuff.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure icon={Boxes} label="Confirmed items" value={String(requirement.itemCount)} />
        <Figure
          icon={Ruler}
          label="Estimated belongings volume"
          value={formatVolume(requirement.totals.itemVolumeM3)}
          detail="Object volume only"
        />
        <Figure
          icon={Maximize}
          label="Recommended usable storage"
          value={formatVolume(requirement.requiredVolumeM3)}
          detail="Includes packing allowance"
        />
        {requirement.requiredFloorAreaM2 > 0 ? (
          <Figure
            icon={Maximize}
            label="Approximate floor footprint"
            value={`${requirement.requiredFloorAreaM2.toFixed(2)} m²`}
            detail="Includes room to walk in"
          />
        ) : null}
      </div>

      <p className="mt-4 type-body-sm text-muted-foreground">
        Recommended usable storage isn&apos;t just your items added together: it adds a practical
        packing allowance for gaps, awkward shapes and the space you need to reach things.{" "}
        {ALLOWANCE_EXPLAINER}
      </p>

      <p className="mt-2 type-body-sm text-muted-foreground">
        {REQUIREMENT_CONFIDENCE_LABEL[requirement.confidence]}
      </p>

      {requirement.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {requirement.warnings.map((warning) => (
            <li key={warning} className="flex gap-2 type-body-sm text-warning-soft-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer type-body-sm text-muted-foreground">
          How we worked this out
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 type-body-sm text-muted-foreground">
          {requirement.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>

      {showAction ? (
        <Button asChild className="mt-4">
          <Link to="/renter/matches">
            Find spaces that fit
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}

      <p className="mt-3 type-body-xs text-muted-foreground">{REQUIREMENT_DISCLAIMER}</p>
    </section>
  );
}
