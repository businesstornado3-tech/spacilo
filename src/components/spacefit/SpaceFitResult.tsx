/**
 * SpaceFit result presentation. Score, label and the deterministic reasons
 * behind them. No arithmetic happens here — the engine owns all scoring.
 */
import * as React from "react";
import { Check, AlertTriangle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Modal } from "@/components/overlay/Modal";
import { Button } from "@/components/ui/button";
import { COMPONENT_LABELS } from "@/lib/spacefit/explanations";
import { SPACEFIT_MATCH_DISCLAIMER } from "@/lib/spacefit/config";
import type { ComponentKey, SpaceFitResult } from "@/lib/spacefit/types";

const TONE: Record<string, string> = {
  excellent: "bg-success-soft text-success-soft-foreground",
  great: "bg-primary-soft text-primary-soft-foreground",
  good: "bg-primary-soft text-primary-soft-foreground",
  possible: "bg-warning-soft text-warning-soft-foreground",
  low: "bg-warning-soft text-warning-soft-foreground",
  none: "bg-destructive-soft text-destructive-soft-foreground",
};

function tone(result: SpaceFitResult) {
  if (!result.compatible) return TONE.none;
  const score = result.score ?? 0;
  if (score >= 90) return TONE.excellent;
  if (score >= 80) return TONE.great;
  if (score >= 70) return TONE.good;
  return TONE.possible;
}

/** Score pill — "92% SpaceFit" or "Not suitable". */
export function SpaceFitResultBadge({
  result,
  className,
}: {
  result: SpaceFitResult;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 type-badge tabular-nums",
        tone(result),
        className,
      )}
    >
      {result.compatible ? `${result.score}% SpaceFit` : "Not suitable"}
    </span>
  );
}

export function ReasonList({
  positives = [],
  warnings = [],
  failures = [],
  limit,
}: {
  positives?: string[];
  warnings?: string[];
  failures?: string[];
  limit?: number;
}) {
  const shownPositives = limit ? positives.slice(0, limit) : positives;
  return (
    <ul className="space-y-1.5">
      {failures.map((reason) => (
        <li key={reason} className="flex gap-2 type-body-sm">
          <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <span>{reason}</span>
        </li>
      ))}
      {shownPositives.map((reason) => (
        <li key={reason} className="flex gap-2 type-body-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>{reason}</span>
        </li>
      ))}
      {warnings.map((reason) => (
        <li key={reason} className="flex gap-2 type-body-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Why this matches" — component-by-component breakdown that sums to the total. */
export function SpaceFitBreakdown({ result }: { result: SpaceFitResult }) {
  if (!result.components) return null;
  const keys = Object.keys(result.components) as ComponentKey[];
  return (
    <div className="space-y-4">
      <dl className="space-y-4">
        {keys.map((key) => {
          const component = result.components![key];
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="type-body font-semibold">{COMPONENT_LABELS[key]}</dt>
                <dd className="type-body-sm tabular-nums text-muted-foreground">
                  {component.score}/{component.max}
                </dd>
              </div>
              <p className="mt-1 type-body-sm text-muted-foreground">{component.detail}</p>
            </div>
          );
        })}
      </dl>
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <p className="type-body font-semibold">Total</p>
        <p className="type-price tabular-nums">{result.score}/100</p>
      </div>
      <p className="type-body-sm text-muted-foreground">{SPACEFIT_MATCH_DISCLAIMER}</p>
    </div>
  );
}

/** Button + modal wrapper used on cards and the listing detail page. */
export function WhyThisMatches({ result }: { result: SpaceFitResult }) {
  const [open, setOpen] = React.useState(false);
  if (!result.compatible || !result.components) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Why this matches
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Why this matches"
        description={`${result.score}% SpaceFit — ${result.label}`}
      >
        <SpaceFitBreakdown result={result} />
      </Modal>
    </>
  );
}
