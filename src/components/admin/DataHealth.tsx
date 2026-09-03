/**
 * Founder console — "Data health & provenance" (internal only).
 *
 * Purpose: make every number in this console traceable. Each figure is
 * labelled with where it comes from, how it is calculated, what is excluded
 * and how fresh it is. Nothing here is modelled or estimated, and anything
 * that could not be loaded reads "unavailable" rather than zero.
 *
 * Presentation only — the underlying counts come from `admin_data_health`,
 * a SECURITY DEFINER RPC that re-checks `is_platform_admin(auth.uid())`.
 */
import { Badge } from "@/components/ui/badge";
import {
  DATA_STATUS_LABEL,
  DATA_STATUS_TONE,
  FRESHNESS_LABEL,
  PROVENANCE,
  UNIQUE_VISITORS_PROVENANCE,
  type HealthCheck,
} from "@/lib/admin/provenance";

const STATE_TONE: Record<HealthCheck["state"], "success" | "warning" | "neutral"> = {
  OK: "success",
  ATTENTION: "warning",
  UNAVAILABLE: "neutral",
};

export function DataHealth({ checks }: { checks: HealthCheck[] }) {
  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-sm font-medium">{check.label}</span>
              <Badge variant={STATE_TONE[check.state]}>{FRESHNESS_LABEL[check.freshness]}</Badge>
            </div>
            <p className="mt-1 type-body-xs text-muted-foreground">{check.detail}</p>
          </li>
        ))}
      </ul>

      {/* The single most-questioned figure, proved end to end. */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="type-label">How “unique visitors” is produced</h3>
          <Badge variant={DATA_STATUS_TONE[UNIQUE_VISITORS_PROVENANCE.status]}>
            {DATA_STATUS_LABEL[UNIQUE_VISITORS_PROVENANCE.status]}
          </Badge>
        </div>
        <dl className="mt-2 space-y-1.5 type-body-xs">
          <div>
            <dt className="font-medium">Source</dt>
            <dd className="text-muted-foreground">{UNIQUE_VISITORS_PROVENANCE.source}</dd>
          </div>
          <div>
            <dt className="font-medium">Calculation</dt>
            <dd className="text-muted-foreground">{UNIQUE_VISITORS_PROVENANCE.calculation}</dd>
          </div>
          {UNIQUE_VISITORS_PROVENANCE.timezone ? (
            <div>
              <dt className="font-medium">Time period</dt>
              <dd className="text-muted-foreground">{UNIQUE_VISITORS_PROVENANCE.timezone}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium">Excluded</dt>
            <dd className="text-muted-foreground">
              <ul className="list-disc space-y-0.5 pl-4">
                {UNIQUE_VISITORS_PROVENANCE.exclusions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium">What it does not mean</dt>
            <dd className="text-muted-foreground">
              <ul className="list-disc space-y-0.5 pl-4">
                {(UNIQUE_VISITORS_PROVENANCE.caveats ?? []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </div>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="type-body-sm font-medium">Provenance of every other figure</summary>
        <ul className="mt-2 space-y-2">
          {PROVENANCE.filter((entry) => entry.key !== UNIQUE_VISITORS_PROVENANCE.key).map(
            (entry) => (
              <li key={entry.key} className="border-t border-border pt-2 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="type-body-sm font-medium">{entry.label}</span>
                  <Badge variant={DATA_STATUS_TONE[entry.status]}>
                    {DATA_STATUS_LABEL[entry.status]}
                  </Badge>
                </div>
                <p className="mt-1 type-body-xs text-muted-foreground">{entry.calculation}</p>
                <p className="mt-0.5 type-body-xs text-muted-foreground">Source: {entry.source}</p>
                {entry.caveats?.length ? (
                  <p className="mt-0.5 type-body-xs text-muted-foreground">
                    Caveat: {entry.caveats[0]}
                  </p>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </details>
    </div>
  );
}
