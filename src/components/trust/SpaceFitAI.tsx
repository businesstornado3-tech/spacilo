import * as React from "react";
import { Boxes, MapPin, Ruler } from "lucide-react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-motion";
import { spaceFitBand, SPACEFIT_DISCLAIMER } from "@/lib/spacefit";
import type { SpaceFitBand } from "@/types/models";

/** The four-point sparkle that marks anything EarnRoom AI touches. */
export function SpaceFitSpark({ className }: { className?: string | undefined }) {
  return (
    <span aria-hidden="true" className={cn("animate-twinkle text-signal", className)}>
      ✦
    </span>
  );
}

/**
 * "EarnRoom AI ✦" wordmark. Intelligent and quiet — not a chatbot avatar.
 */
export function SpaceFitAiMark({
  size = "md",
  tone = "soft",
  className,
}: {
  size?: "sm" | "md";
  tone?: "soft" | "plain";
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-display font-semibold tracking-tight",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        tone === "soft"
          ? "bg-signal-soft text-signal-soft-foreground"
          : "text-signal-soft-foreground",
        className,
      )}
    >
      {brand.ai}
      <SpaceFitSpark />
    </span>
  );
}

const BAND_TEXT: Record<SpaceFitBand, string> = {
  excellent: "text-success",
  good: "text-primary",
  possible: "text-warning-soft-foreground",
  poor: "text-destructive",
};

const BAND_RING: Record<SpaceFitBand, string> = {
  excellent: "var(--color-success)",
  good: "var(--color-primary)",
  possible: "var(--color-warning)",
  poor: "var(--color-destructive)",
};

/**
 * Large SpaceFit score that counts smoothly up from 0.
 * Always presented as an estimate.
 */
export function AnimatedSpaceFitScore({
  score,
  size = "md",
  showLabel = true,
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string | undefined;
}) {
  const target = Math.max(0, Math.min(100, score));
  const animated = useCountUp(target);
  const { band, label } = spaceFitBand(target);
  const dimension = size === "lg" ? 148 : size === "sm" ? 84 : 116;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        className="relative grid place-items-center rounded-full"
        style={{
          width: dimension,
          height: dimension,
          background: `conic-gradient(${BAND_RING[band]} ${animated * 3.6}deg, var(--color-muted) 0deg)`,
        }}
        role="meter"
        aria-valuenow={Math.round(target)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`EarnRoom AI estimate ${Math.round(target)} per cent — ${label}`}
      >
        <div className="grid size-[82%] place-items-center rounded-full bg-card text-center">
          <div>
            <p
              className={cn(
                "type-price tabular-nums",
                BAND_TEXT[band],
                size === "lg" ? "text-4xl" : size === "sm" ? "text-xl" : "text-3xl",
              )}
            >
              {Math.round(animated)}%
            </p>
            <p className="type-overline text-muted-foreground">Fit</p>
          </div>
        </div>
      </div>
      {showLabel ? (
        <p className={cn("mt-3 type-label", BAND_TEXT[band])}>{label}</p>
      ) : null}
    </div>
  );
}

/** Rows of the analysis summary. */
export interface SpaceFitAnalysis {
  itemCount: number;
  estimatedVolumeM3: number;
  nearbySpaceCount: number;
  score: number;
}

/**
 * The "Scanning your items…" state. Purely presentational — no AI is called.
 */
export function SpaceFitScanning({
  label = "Scanning your items…",
  className,
}: {
  label?: string;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-signal/25 bg-signal-soft/40 p-5",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <SpaceFitAiMark size="sm" />
        <p className="type-label text-signal-soft-foreground">{label}</p>
      </div>
      <div className="mt-4 space-y-2.5">
        {[100, 82, 64].map((w) => (
          <div
            key={w}
            className="relative h-3 overflow-hidden rounded-full bg-card/70"
            style={{ width: `${w}%` }}
          >
            <div className="animate-sweep absolute inset-y-0 w-1/3 bg-signal/25" />
          </div>
        ))}
      </div>
      <p className="mt-4 type-body-sm text-muted-foreground">
        Estimating volume from your photos. This is an estimate, not a guarantee.
      </p>
    </div>
  );
}

/**
 * Completed analysis: items identified, estimated volume, matching spaces
 * and the headline SpaceFit score.
 */
export function SpaceFitResult({
  analysis,
  className,
}: {
  analysis: SpaceFitAnalysis;
  className?: string | undefined;
}) {
  const stats = [
    { icon: Boxes, value: `${analysis.itemCount} items`, label: "identified" },
    {
      icon: Ruler,
      value: `${analysis.estimatedVolumeM3.toFixed(1)} m³`,
      label: "estimated storage",
    },
    {
      icon: MapPin,
      value: `${analysis.nearbySpaceCount} spaces`,
      label: "suitable nearby",
    },
  ];

  return (
    <div
      className={cn(
        "animate-rise overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <SpaceFitAiMark size="sm" />
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <AnimatedSpaceFitScore score={analysis.score} className="animate-pop shrink-0" />
        <ul className="grid w-full gap-3">
          {stats.map(({ icon: Icon, value, label }) => (
            <li key={label} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
              <Icon className="size-4 shrink-0 text-signal-soft-foreground" aria-hidden="true" />
              <span className="type-label tabular-nums">{value}</span>
              <span className="type-body-sm text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-5 type-body-sm text-muted-foreground">{SPACEFIT_DISCLAIMER}</p>
    </div>
  );
}

/** Convenience demo wrapper: scanning state that resolves into the result. */
export function SpaceFitAnalysisPanel({
  analysis,
  scanMs = 1800,
  className,
}: {
  analysis: SpaceFitAnalysis;
  scanMs?: number;
  className?: string | undefined;
}) {
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDone(true), scanMs);
    return () => window.clearTimeout(id);
  }, [scanMs]);

  return done ? (
    <SpaceFitResult analysis={analysis} className={className} />
  ) : (
    <SpaceFitScanning className={className} />
  );
}
