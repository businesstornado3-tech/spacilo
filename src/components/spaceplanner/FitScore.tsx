/**
 * FitScore — the EarnRoom AI Score dial.
 *
 * A single figure with its band, backed by the deterministic checks in
 * `@/lib/spaceplanner/score`. Used on the homepage demo, the listing planner
 * and the host review panel, so the number always means the same thing.
 */
import { cn } from "@/lib/utils";
import type { EarnRoomScore } from "@/lib/spaceplanner";

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toneFor(value: number) {
  if (value >= 88) return "text-success";
  if (value >= 68) return "text-primary";
  if (value >= 50) return "text-warning";
  return "text-destructive";
}

export interface FitScoreProps {
  score: EarnRoomScore;
  size?: "sm" | "md";
  className?: string;
}

export function FitScore({ score, size = "md", className }: FitScoreProps) {
  const tone = toneFor(score.value);
  const dash = (score.value / 100) * CIRCUMFERENCE;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg
        viewBox="0 0 80 80"
        className={cn("shrink-0", size === "sm" ? "size-14" : "size-20")}
        role="img"
        aria-label={`EarnRoom AI Score ${score.value} out of 100 — ${score.band}`}
      >
        <circle cx="40" cy="40" r={RADIUS} className="fill-none stroke-surface" strokeWidth={8} />
        <circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          transform="rotate(-90 40 40)"
          className={cn("stroke-current transition-[stroke-dasharray] duration-700", tone)}
        />
        <text
          x="40"
          y="46"
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: 24, fontWeight: 700 }}
        >
          {score.value}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="type-badge text-muted-foreground">EarnRoom AI Score</p>
        <p className={cn("type-h4", tone)}>{score.band}</p>
        <p className="type-body-sm text-muted-foreground">
          Estimated fit {score.fitPercent}% · packing {score.complexity.toLowerCase()}
        </p>
      </div>
    </div>
  );
}

/** The full check list — used before booking and by hosts reviewing requests. */
export function FitScoreChecks({ score }: { score: EarnRoomScore }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {score.checks.map((check) => (
        <div
          key={check.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl bg-surface px-3 py-2"
        >
          <div className="min-w-0">
            <dt className="type-label">{check.label}</dt>
            <dd className="type-badge text-muted-foreground">{check.detail}</dd>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 type-badge",
              check.state === "passed" && "bg-success-soft text-success-soft-foreground",
              check.state === "attention" && "bg-warning-soft text-warning-soft-foreground",
              check.state === "failed" && "bg-destructive-soft text-destructive-soft-foreground",
            )}
          >
            {check.state === "passed" ? "Passed" : check.state === "attention" ? "Check" : "Issue"}
          </span>
        </div>
      ))}
    </dl>
  );
}
