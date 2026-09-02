/**
 * RequestFitPanel — EarnRoom AI SpacePlanner™ inside a host's request review.
 *
 * The renter's estimated requirement is run against the host's own available
 * capacity so the host can see the estimated fit, what would remain and how
 * the request changes utilisation. EarnRoom AI never accepts or declines — the
 * host remains the decision maker.
 */
import * as React from "react";
import { Sparkles } from "lucide-react";

import { analyseVolumeFit } from "@/lib/spaceplanner/photo";
import { track } from "@/lib/analytics/tracker";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <dt className="type-overline text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 type-card-title">{value}</dd>
    </div>
  );
}

export function RequestFitPanel({
  itemCount,
  requirementM3,
  capacityM3,
}: {
  itemCount: number;
  requirementM3: number;
  capacityM3: number | null;
}) {
  const fit = React.useMemo(
    () =>
      capacityM3 === null
        ? null
        : analyseVolumeFit({ requiredM3: requirementM3, availableM3: capacityM3 }),
    [requirementM3, capacityM3],
  );

  React.useEffect(() => {
    if (fit) track("spaceplanner_request_fit_checked", { props: { fit: fit.fitPercent } });
  }, [fit]);

  if (!fit) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="type-overline text-muted-foreground">EarnRoom AI SpacePlanner™</p>
      <h2 className="mt-1 flex items-center gap-2 type-h3">
        <Sparkles className="size-5 text-signal-soft-foreground" aria-hidden="true" />
        Estimated fit for this request
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        {itemCount} items · estimated requirement {fit.requiredM3.toFixed(1)}m³
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Estimated fit" value={`${fit.fitPercent}%`} />
        <Metric label="Space required" value={`${fit.requiredM3.toFixed(1)}m³`} />
        <Metric label="Available capacity" value={`${fit.availableM3.toFixed(1)}m³`} />
        <Metric label="Estimated remaining" value={`${fit.remainingM3.toFixed(1)}m³`} />
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Utilisation now" value={`${fit.utilisationBefore}%`} />
        <Metric label="After this request" value={`${fit.utilisationAfter}%`} />
      </dl>

      <p className="mt-4 type-body-sm">{fit.recommendation}</p>
      <p className="mt-2 type-body-xs text-muted-foreground">
        AI estimate based on the information provided. You remain the decision maker — final fit
        depends on actual measurements and conditions.
      </p>
    </section>
  );
}
