import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-motion";
import { spaceFitBand, SPACEFIT_DISCLAIMER } from "@/lib/spacefit";
import type { SpaceFitBand } from "@/types/models";

const BAND_CLASSES: Record<SpaceFitBand, string> = {
  excellent: "bg-success-soft text-success-soft-foreground",
  good: "bg-primary-soft text-primary-soft-foreground",
  possible: "bg-warning-soft text-warning-soft-foreground",
  poor: "bg-destructive-soft text-destructive-soft-foreground",
};

const BAR_CLASSES: Record<SpaceFitBand, string> = {
  excellent: "bg-success",
  good: "bg-primary",
  possible: "bg-warning",
  poor: "bg-destructive",
};

interface SpaceFitProps {
  score: number;
  className?: string | undefined;
}

/** Compact pill, e.g. "96% SpaceFit" — for cards and lists. */
export function SpaceFitBadge({ score, className }: SpaceFitProps) {
  const { band, label } = spaceFitBand(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 type-badge tabular-nums",
        BAND_CLASSES[band],
        className,
      )}
      title={`${label} — ${SPACEFIT_DISCLAIMER}`}
    >
      {Math.round(score)}% fit
    </span>
  );
}

/** Expanded presentation with an animated score bar and supporting text. */
export function SpaceFitMeter({
  score,
  className,
  showDisclaimer = true,
}: SpaceFitProps & { showDisclaimer?: boolean }) {
  const { band, description } = spaceFitBand(score);
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const animated = useCountUp(value);

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-price tabular-nums">{Math.round(animated)}% fit</p>
        <SpaceFitBadge score={value} className="shrink-0" />
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="EarnRoom AI compatibility estimate"
      >
        <div
          className={cn("h-full rounded-full transition-none", BAR_CLASSES[band])}
          style={{ width: `${animated}%` }}
        />
      </div>
      <p className="mt-2 type-body-sm text-muted-foreground">{description}</p>
      {showDisclaimer ? (
        <p className="mt-3 flex gap-2 type-body-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{SPACEFIT_DISCLAIMER}</span>
        </p>
      ) : null}
    </div>
  );
}
