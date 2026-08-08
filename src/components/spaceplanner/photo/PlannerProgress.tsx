/**
 * Phase 6J — honest progress.
 *
 * Ten real stages, each reflecting work that has genuinely happened, plus the
 * elapsed clock. Nothing here animates forward on its own.
 */
import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from "lucide-react";

import { currentPlannerStep, plannerProgressPercent, type PlannerStep } from "@/lib/spaceplanner/photo/progress";

function Icon({ state }: { state: PlannerStep["state"] }) {
  if (state === "done") return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (state === "failed") return <CircleAlert className="size-4 text-warning" aria-hidden="true" />;
  if (state === "working")
    return <LoaderCircle className="size-4 animate-spin text-signal" aria-hidden="true" />;
  return <Circle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

export function PlannerProgress({
  steps,
  elapsedMs,
  planReady,
}: {
  steps: PlannerStep[];
  elapsedMs: number;
  planReady: boolean;
}) {
  const percent = plannerProgressPercent(steps);
  const current = currentPlannerStep(steps);

  return (
    <section
      aria-label="SpacePlanner progress"
      aria-live="polite"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="type-label">
          {current
            ? planReady
              ? `Your arrangement plan is ready — ${current.label.toLowerCase()}…`
              : `${current.label}…`
            : "All stages complete"}
        </p>
        <p className="type-body-xs text-muted-foreground">
          {percent}% · {Math.round(elapsedMs / 1000)}s
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-2 type-body-sm">
            <Icon state={entry.state} />
            <span className="text-muted-foreground">Step {index + 1}</span>
            <span className={entry.state === "waiting" ? "text-muted-foreground" : undefined}>
              {entry.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default PlannerProgress;
