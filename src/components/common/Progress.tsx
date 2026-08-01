import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Linear determinate progress bar. */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between type-body-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums text-foreground">{Math.round(v)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

/** Multi-step indicator for onboarding and booking flows. */
export function StepProgress({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full type-badge",
                done && "bg-success text-success-foreground",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden truncate type-body-sm sm:block",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {step}
            </span>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn("h-px flex-1", done ? "bg-success" : "bg-border")}
              />
            ) : null}
            <span className="sr-only">
              {step} {done ? "completed" : active ? "current step" : "not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
