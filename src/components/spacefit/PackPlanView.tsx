/**
 * SPACEFIT PACK — renders the deterministic packing plan.
 *
 * Every zone, order, warning and check comes from `src/lib/spacefit/pack.ts`.
 * Nothing here is generated: AI cannot change placement, fit classification or
 * safety guidance. When the geometry is too thin for a meaningful schematic we
 * say so and fall back to text, rather than drawing fake precision.
 */
import { ArrowDownWideNarrow, Boxes, DoorOpen, Info, ShieldAlert, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { PACK_PLAN_DISCLAIMER, type PackPlan } from "@/lib/spacefit/pack";
import {
  hasSchematicGeometry,
  INSUFFICIENT_GEOMETRY_MESSAGE,
  SCHEMATIC_DISCLAIMER,
  type PlanSpaceSnapshot,
} from "@/lib/spacefit/plan";

const CHECK_COPY: Record<string, { label: string; tone: "ok" | "warn" | "unknown" }> = {
  pass: { label: "Looks fine", tone: "ok" },
  tight: { label: "Tight", tone: "warn" },
  fail: { label: "Problem", tone: "warn" },
  unknown: { label: "Not enough data", tone: "unknown" },
};

function CheckRow({ label, state }: { label: string; state: string }) {
  const meta = CHECK_COPY[state] ?? CHECK_COPY["unknown"]!;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="type-body-sm">{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 type-body-xs",
          meta.tone === "ok" && "bg-success-soft text-success-soft-foreground",
          meta.tone === "warn" && "bg-warning-soft text-warning-soft-foreground",
          meta.tone === "unknown" && "bg-secondary text-muted-foreground",
        )}
      >
        {meta.label}
      </span>
    </div>
  );
}

/** Lightweight zone schematic. Only rendered with usable verified geometry. */
function Schematic({ plan }: { plan: PackPlan }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-xl border border-border bg-background">
      <figcaption className="border-b border-border bg-secondary/60 px-3 py-1.5 text-center type-body-xs uppercase tracking-wide text-muted-foreground">
        Back wall
      </figcaption>
      <div className="space-y-2 p-3">
        {plan.zones.map((zone) => (
          <div key={zone.key} className="rounded-lg border border-dashed border-border p-2.5">
            <p className="type-body-xs uppercase tracking-wide text-muted-foreground">
              {zone.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {zone.items.map((item) => (
                <span
                  key={`${zone.key}-${item.label}`}
                  className={cn(
                    "rounded-md px-2 py-1 type-body-xs",
                    item.fragile
                      ? "bg-warning-soft text-warning-soft-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {item.quantity > 1 ? `${item.quantity} × ` : ""}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-lg bg-secondary/50 px-2.5 py-2 text-center type-body-xs text-muted-foreground">
          Access / walkway
        </div>
      </div>
      <p className="border-t border-border bg-secondary/60 px-3 py-1.5 text-center type-body-xs uppercase tracking-wide text-muted-foreground">
        Door
      </p>
    </figure>
  );
}

export function PackPlanView({
  plan,
  space,
  title = "SpaceFit Pack",
  intro,
  className,
}: {
  plan: PackPlan;
  space: PlanSpaceSnapshot;
  title?: string;
  intro?: string;
  className?: string;
}) {
  const schematic = hasSchematicGeometry(plan, space);

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <h2 className="flex items-center gap-2 type-h3">
        <Boxes className="size-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {intro ? <p className="mt-1 type-body-sm text-muted-foreground">{intro}</p> : null}

      {plan.loadingOrder.length > 0 ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-2 type-label">
            <ArrowDownWideNarrow className="size-4" aria-hidden="true" />
            Suggested loading order
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 type-body-sm text-muted-foreground">
            {plan.loadingOrder.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {plan.zones.length > 0 ? (
        <div className="mt-4">
          <h3 className="type-label">Suggested placement</h3>
          <ul className="mt-2 space-y-2">
            {plan.zones.map((zone) => (
              <li key={zone.key} className="rounded-xl bg-secondary/50 p-3">
                <p className="type-body-sm font-semibold">{zone.title}</p>
                <p className="type-body-xs text-muted-foreground">{zone.description}</p>
                <p className="mt-1 type-body-sm">
                  {zone.items
                    .map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.label}` : item.label))
                    .join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {schematic ? (
        <div className="mt-4">
          <h3 className="type-label">SpaceFit suggested arrangement</h3>
          <Schematic plan={plan} />
          <p className="mt-2 type-body-xs text-muted-foreground">{SCHEMATIC_DISCLAIMER}</p>
        </div>
      ) : (
        <p className="mt-4 flex gap-2 rounded-xl bg-secondary/60 p-3 type-body-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {INSUFFICIENT_GEOMETRY_MESSAGE} The loading order and placement guidance above still
          apply.
        </p>
      )}

      <div className="mt-4">
        <h3 className="type-label">Fit checks</h3>
        <div className="mt-1">
          <CheckRow label="Floor space" state={plan.floorAreaCheck} />
          <CheckRow label="Headroom" state={plan.headroomCheck} />
          <CheckRow label="Entrance clearance" state={plan.doorwayCheck} />
        </div>
        {plan.utilisationPercent !== null ? (
          <p className="mt-2 type-body-sm text-muted-foreground">
            Estimated to use about {plan.utilisationPercent}% of the usable volume.
          </p>
        ) : null}
      </div>

      {plan.safety.length > 0 ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-2 type-label">
            <ShieldAlert className="size-4" aria-hidden="true" />
            Warnings and safety
          </h3>
          <ul className="mt-2 space-y-1.5">
            {plan.safety.map((line) => (
              <li key={line} className="flex gap-2 type-body-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.accessNotes.length > 0 ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-2 type-label">
            <DoorOpen className="size-4" aria-hidden="true" />
            Access
          </h3>
          <ul className="mt-2 space-y-1.5">
            {plan.accessNotes.map((line) => (
              <li key={line} className="type-body-sm text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 type-body-xs text-muted-foreground">{PACK_PLAN_DISCLAIMER}</p>
    </section>
  );
}
