/**
 * SpacePlannerResult — one result, everywhere.
 *
 * Homepage, renter dashboard, host dashboard, listing pages, booking flow and
 * host request review all show the same hierarchy: what was detected, the fit,
 * the space used and remaining, then the arrangement and the explanation.
 *
 * Percentages are never communicated by colour alone — each figure carries its
 * own label and value in text.
 */
import { CircleDashed, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PhotoPlanResult } from "@/lib/spaceplanner/photo";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <dt className="type-overline text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 type-card-title">
        {value}
        {/* Only dt/dd may sit inside a dl group — the hint lives in the dd. */}
        {hint ? <span className="mt-0.5 block type-body-xs text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>

  );
}

export function SpacePlannerResult({
  result,
  children,
  className,
  unplaced = [],
  heading = "Spacilo AI SpacePlanner™",
}: {
  result: PhotoPlanResult;
  /**
   * Phase 6AH/6AJ — belongings the planner could not accommodate. Everything
   * else was still arranged: a partial arrangement is a successful plan, not a
   * failure, so these are listed plainly with the deterministic reason.
   */
  unplaced?: readonly { label: string; reason: string; quantity?: number }[];
  /** The visual arrangement — the user's photo, or another renderer. */
  children?: React.ReactNode;
  className?: string;
  heading?: string;
}) {
  const partial = unplaced.length > 0;
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <header>
        <p className="type-overline text-muted-foreground">{heading}</p>
        <h3 className="mt-1 type-h3">
          {partial ? "Arrangement ready — some items could not be placed" : "Arrangement ready"}
        </h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Items detected: {result.itemCount} · Estimated volume:{" "}
          {result.plan.metrics.itemVolume.toFixed(1)}m³
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Estimated fit" value={`${result.fitPercent}%`} hint="AI estimate" />
        <Metric label="Estimated space used" value={`${result.spaceUsedM3.toFixed(1)}m³`} />
        <Metric
          label="Estimated space remaining"
          value={`${result.spaceRemainingM3.toFixed(1)}m³`}
        />
        <Metric
          label="Access"
          value={result.walkwayPreserved ? "Walkway kept" : "Tight access"}
        />
      </dl>

      <p className="mt-3 type-body-sm text-muted-foreground">
        Estimated storage requirement: approximately {result.requirementLowM3.toFixed(1)}–
        {result.requirementHighM3.toFixed(1)}m³.
      </p>

      {partial ? (
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <p className="type-overline text-muted-foreground">Not placed</p>
          <ul className="mt-1.5 space-y-1.5">
            {unplaced.map((entry) => (
              <li key={`${entry.label}-${entry.reason}`} className="flex gap-2 type-body-sm">
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  {entry.quantity && entry.quantity > 1 ? `${entry.quantity} × ` : ""}
                  {entry.label} — {entry.reason}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 type-body-xs text-muted-foreground">
            Everything else was arranged. These items could not be accommodated safely in this
            space — a larger space, or a second visit, would be the safer plan.
          </p>
        </div>
      ) : null}


      {children ? <div className="mt-4">{children}</div> : null}

      <p className="mt-4 type-body-sm">{result.explanation}</p>

      {result.improvements.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {result.improvements.map((improvement) => (
            <li key={improvement} className="flex gap-2 type-body-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-signal-soft-foreground" aria-hidden="true" />
              {improvement}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 type-body-xs text-muted-foreground">
        AI estimates are based on the photos provided. Final fit depends on actual measurements and
        conditions — verify measurements before committing to a booking where required.
      </p>
    </section>
  );
}
