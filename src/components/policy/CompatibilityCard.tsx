/**
 * The three-dimension compatibility summary shown to renters.
 *
 * Physical fit, policy and space suitability are judged separately and never
 * averaged into one score, because "it fits" and "it's suitable" are
 * different questions with different answers.
 */
import { Boxes, ShieldCheck, Home, CircleCheck, TriangleAlert, CircleX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { COMPATIBILITY_LABEL } from "@/lib/policy/engine";
import type { CompatibilityDimension, CompatibilityReport, CompatibilityStatus } from "@/lib/policy/types";

const ICON = {
  compatible: CircleCheck,
  compatible_with_care: TriangleAlert,
  not_compatible: CircleX,
} as const;

const TONE: Record<CompatibilityStatus, "success" | "warning" | "destructive"> = {
  compatible: "success",
  compatible_with_care: "warning",
  not_compatible: "destructive",
};

export function CompatibilityCard({
  report,
  className,
}: {
  report: CompatibilityReport;
  className?: string;
}) {
  const rows: { key: string; label: string; icon: typeof Boxes; dimension: CompatibilityDimension }[] = [
    { key: "physical", label: "Will it fit?", icon: Boxes, dimension: report.physical },
    { key: "policy", label: "Can it be stored?", icon: ShieldCheck, dimension: report.policy },
    { key: "suitability", label: "Does the space suit it?", icon: Home, dimension: report.suitability },
  ];

  return (
    <section className={"rounded-2xl border border-border bg-card p-5 shadow-card " + (className ?? "")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-h3">Is this space right for your things?</h2>
        <Badge variant={TONE[report.overall]} className="ml-auto">
          {COMPATIBILITY_LABEL[report.overall]}
        </Badge>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const StatusIcon = ICON[row.dimension.status];
          return (
            <li key={row.key} className="flex gap-3 rounded-xl border border-border bg-background p-4">
              <row.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 type-label">
                  {row.label}
                  <StatusIcon
                    className={
                      "size-4 " +
                      (row.dimension.status === "compatible"
                        ? "text-success"
                        : row.dimension.status === "not_compatible"
                          ? "text-destructive"
                          : "text-warning")
                    }
                    aria-hidden="true"
                  />
                </p>
                <p className="mt-0.5 type-body-sm">{row.dimension.headline}</p>
                {row.dimension.detail ? (
                  <p className="mt-0.5 type-body-sm text-muted-foreground">{row.dimension.detail}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 type-body-xs text-muted-foreground">
        These are checks and estimates based on what you and the host have told us — not a
        guarantee.
      </p>
    </section>
  );
}
