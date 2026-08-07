/**
 * DimensionCard — one estimated measurement, always labelled as an estimate.
 */
import { cn } from "@/lib/utils";

export function DimensionCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-0.5 type-h4 tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 type-body-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
