/**
 * The consolidated SpaceFit confidence section on a public listing.
 *
 * One glance answers: will it fit, can it be stored, does the space suit it —
 * plus the two numbers that decide it (their requirement vs this space's usable
 * capacity), each labelled with where it came from.
 *
 * All wording is produced by `@/lib/trust/listing-confidence`; this file only
 * renders it. No claim here is stronger than the data behind it.
 */
import { CircleCheck, CircleHelp, CircleX, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { OUTCOME_LABEL } from "@/lib/policy/engine";
import type { CheckState, ListingConfidence, WhySection } from "@/lib/trust/listing-confidence";

const STATE_ICON: Record<CheckState, typeof CircleCheck> = {
  pass: CircleCheck,
  note: TriangleAlert,
  action: TriangleAlert,
  fail: CircleX,
  blocked: CircleX,
  unknown: CircleHelp,
};

const STATE_COLOUR: Record<CheckState, string> = {
  pass: "text-success",
  note: "text-warning",
  action: "text-warning",
  fail: "text-destructive",
  blocked: "text-destructive",
  unknown: "text-muted-foreground",
};

const OUTCOME_TONE: Record<string, string> = {
  strong_match: "bg-success-soft text-success-soft-foreground",
  match_with_notes: "bg-primary-soft text-primary-soft-foreground",
  action_required: "bg-warning-soft text-warning-soft-foreground",
  incompatible: "bg-destructive-soft text-destructive-soft-foreground",
  blocked_by_policy: "bg-destructive-soft text-destructive-soft-foreground",
};

function ValueBlock({
  label,
  value,
  provenance,
}: {
  label: string;
  value: string | null;
  provenance: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="type-body-sm text-muted-foreground">{label}</p>
      <p className="mt-1 type-price tabular-nums">{value ?? "Not known"}</p>
      <p className="mt-1 type-body-xs text-muted-foreground">{provenance}</p>
    </div>
  );
}

export function ListingConfidenceSection({
  confidence,
  why,
  className,
}: {
  confidence: ListingConfidence;
  why: WhySection;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}
      aria-label="Fit confidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-h3">Is this space right for your stuff?</h2>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 type-badge",
            OUTCOME_TONE[confidence.outcome] ?? "bg-muted text-muted-foreground",
          )}
        >
          {OUTCOME_LABEL[confidence.outcome]}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {confidence.checks.map((check) => {
          const Icon = STATE_ICON[check.state];
          return (
            <li key={check.key} className="flex gap-3 rounded-xl border border-border bg-background p-3">
              <Icon
                className={cn("mt-0.5 size-4 shrink-0", STATE_COLOUR[check.state])}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="type-label">
                  {check.label} — <span className="font-normal">{check.statusText}</span>
                </p>
                <p className="mt-0.5 type-body-sm text-muted-foreground">{check.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ValueBlock {...confidence.requirement} />
        <ValueBlock {...confidence.capacity} />
      </div>

      <div className="mt-5">
        <h3 className="type-label">{why.title}</h3>
        <ul className="mt-2 space-y-1.5">
          {why.reasons.map((reason) => {
            const Icon =
              why.tone === "positive" ? CircleCheck : why.tone === "caution" ? TriangleAlert : CircleX;
            const colour =
              why.tone === "positive"
                ? "text-success"
                : why.tone === "caution"
                  ? "text-warning"
                  : "text-destructive";
            return (
              <li key={reason} className="flex gap-2 type-body-sm">
                <Icon className={cn("mt-0.5 size-4 shrink-0", colour)} aria-hidden="true" />
                <span>{reason}</span>
              </li>
            );
          })}
          {why.reasons.length === 0 ? (
            <li className="type-body-sm text-muted-foreground">
              The host hasn&apos;t provided enough detail for us to say more yet.
            </li>
          ) : null}
        </ul>
      </div>

      <p className="mt-4 flex gap-2 type-body-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          These are checks and estimates based on what you and the host have told us — not a
          guarantee that everything will fit.
        </span>
      </p>
    </section>
  );
}
