/**
 * Host-facing listing completeness. A checklist, never a score or a grade.
 */
import { Check, CircleAlert, CircleDashed } from "lucide-react";

import { listingQuality, type QualitySpaceInput } from "@/lib/trust/quality";

export function ListingQualityCard({ space }: { space: QualitySpaceInput }) {
  const report = listingQuality(space);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-h3">Listing completeness</h2>
        <span className="type-body-sm tabular-nums text-muted-foreground">
          {report.completedEssentials}/{report.totalEssentials} essentials
        </span>
      </div>
      <p className="mt-1 type-body-sm text-muted-foreground">{report.headline}</p>

      <ul className="mt-4 divide-y divide-border">
        {report.checks.map((check) => (
          <li key={check.key} className="flex gap-3 py-3">
            {check.complete ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : check.weight === "essential" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            ) : (
              <CircleDashed
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <p className="type-body-sm font-semibold">{check.label}</p>
              {check.complete ? null : (
                <>
                  <p className="type-body-sm text-muted-foreground">{check.why}</p>
                  <p className="mt-0.5 type-body-sm">{check.action}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
