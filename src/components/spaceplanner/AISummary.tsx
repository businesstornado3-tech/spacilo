/**
 * The results dashboard and the reasoning behind it.
 *
 * Every number here comes from `plan.metrics`, and every sentence from
 * `plan.explanations` — both derived from the placements actually drawn. The
 * language stays bounded: estimates and observations, never guarantees.
 */
import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SpacePlan } from "@/lib/spaceplanner";

export function AISummary({ plan }: { plan: SpacePlan }) {
  const m = plan.metrics;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric
          label="Space utilisation"
          value={`${m.utilisation}%`}
          tone="signal"
          bar={m.utilisation}
        />
        <Metric label="Storage compatibility" value={`${m.compatibility}%`} bar={m.compatibility} />
        <Metric label="Retrieval ease" value={`${m.retrieval}%`} bar={m.retrieval} />
        <Metric label="Accessibility" value={`${m.accessibility}%`} bar={m.accessibility} />
        <Metric
          label="Stacking efficiency"
          value={`${m.stackingEfficiency}%`}
          bar={m.stackingEfficiency}
        />
        <Metric
          label="Estimated space left"
          value={`${m.remainingCapacity.toFixed(1)}m³`}
          hint={`of ~${m.usableVolume.toFixed(1)}m³ usable`}
        />
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Fact
          label="Your belongings"
          value={`~${m.itemVolume.toFixed(1)}m³`}
          hint={`${plan.itemCount} items`}
        />
        <Fact
          label="With packing allowance"
          value={`~${m.requiredVolume.toFixed(1)}m³`}
          hint="room to move and unload"
        />
        <Fact
          label="Utilisation before"
          value={`${m.utilisationBefore}%`}
          hint={`${m.utilisation - m.utilisationBefore >= 0 ? "+" : ""}${m.utilisation - m.utilisationBefore} points after planning`}
        />
      </dl>

      <ul className="mt-3 flex flex-wrap gap-2">
        <Check
          ok={m.everythingFits}
          yes="Everything fits on these estimates"
          no="Needs a larger space"
        />
        <Check
          ok={m.fragileProtected}
          yes="Fragile items kept clear"
          no="Fragile items need care"
        />
        <Check ok={m.heavyItemsLow} yes="Heavy items on the floor" no="Heavy items stacked high" />
        <Check ok={m.walkwayPreserved} yes="Access strip kept clear" no="Access strip blocked" />
      </ul>
    </div>
  );
}

export function AIExplanation({ plan }: { plan: SpacePlan }) {
  return (
    <section
      aria-labelledby="sp-reasoning"
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h3 id="sp-reasoning" className="flex items-center gap-2 type-h4">
        <Info className="size-4 text-signal-soft-foreground" aria-hidden="true" />
        Why EarnRoom AI planned it this way
      </h3>
      <ul className="mt-3 grid gap-2.5">
        {plan.explanations.map((line) => (
          <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
            <p className="type-body-sm text-muted-foreground">{line}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface p-3 type-badge text-muted-foreground">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        These are estimates from typical dimensions, not a survey. You and your host confirm what
        actually fits before anything is booked.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  bar,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  bar?: number;
  tone?: "neutral" | "signal";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "signal" ? "border-signal/40 bg-signal-soft/40" : "border-border bg-card",
      )}
    >
      <p className="type-overline text-muted-foreground">{label}</p>
      <p className="mt-1 type-price">{value}</p>
      {typeof bar === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-signal transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(2, Math.min(100, bar))}%` }}
          />
        </div>
      ) : null}
      {hint ? <p className="mt-1.5 type-badge text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-3">
      <dt className="type-overline text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 type-card-title">{value}</dd>
      <dd className="type-badge text-muted-foreground">{hint}</dd>
    </div>
  );
}

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <li
      className={cn(
        "rounded-full px-3 py-1 type-badge",
        ok
          ? "bg-success-soft text-success-soft-foreground"
          : "bg-warning-soft text-warning-soft-foreground",
      )}
    >
      {ok ? yes : no}
    </li>
  );
}
