/**
 * Host earning experience.
 *
 * Realistic ranges, the three-step journey, and a lightweight indicative
 * earnings estimator. Everything here is presentational — no listing data, no
 * pricing engine, no promises.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/common/Reveal";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import {
  DEMAND_BANDS,
  EARNING_EXAMPLES,
  SIZE_BANDS,
  estimateEarnings,
  formatEarningsRange,
  type DemandBandId,
  type EarningSpaceKind,
  type SizeBandId,
} from "@/lib/home/earnings-estimate";

const JOURNEY = ["Unused", "Listed", "Generating income"];

export function HostEarnings() {
  return (
    <section aria-labelledby="host-earnings-heading" className="py-9 sm:py-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-xl">
          <h2 id="host-earnings-heading" className="type-h2">
            Your unused space is already earning — for someone else.
          </h2>
          <p className="mt-2.5 type-body-sm text-muted-foreground">
            List the space you are not using and let it pay for itself.
          </p>
        </header>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EARNING_EXAMPLES.map((example, index) => (
            <Reveal as="li" key={example.kind} delay={index * 60}>
              <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-card">
                <p className="type-label text-muted-foreground">{example.label}</p>
                <p className="mt-1 type-h4 tabular-nums">{formatEarningsRange(example.range)}</p>
                <p className="mt-1 type-body-sm text-muted-foreground">{example.blurb}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <ol className="mt-5 flex flex-wrap items-center gap-2" aria-label="Hosting journey">
          {JOURNEY.map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 ? (
                <li aria-hidden="true" className="type-badge text-muted-foreground">
                  →
                </li>
              ) : null}
              <li
                className={cn(
                  "rounded-full border px-3 py-1.5 type-badge",
                  index === JOURNEY.length - 1
                    ? "border-primary/40 bg-primary-soft text-primary-soft-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {step}
              </li>
            </React.Fragment>
          ))}
        </ol>

        <EarningsEstimator />
      </div>
    </section>
  );
}

export function EarningsEstimator() {
  const [kind, setKind] = React.useState<EarningSpaceKind>("garage");
  const [size, setSize] = React.useState<SizeBandId>("medium");
  const [demand, setDemand] = React.useState<DemandBandId>("town");

  const range = estimateEarnings({ kind, size, demand });

  return (
    <div className="mt-6 grid gap-5 rounded-3xl border border-border bg-card p-5 shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-center sm:p-6">
      <div className="min-w-0">
        <h3 className="type-h4">Estimate my earnings</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Three quick choices — no account, no address.
        </p>

        <ChoiceRow label="Space type">
          {EARNING_EXAMPLES.map((example) => (
            <Chip
              key={example.kind}
              active={kind === example.kind}
              onClick={() => setKind(example.kind)}
            >
              {example.label}
            </Chip>
          ))}
        </ChoiceRow>

        <ChoiceRow label="Approximate size">
          {SIZE_BANDS.map((band) => (
            <Chip key={band.id} active={size === band.id} onClick={() => setSize(band.id)}>
              {band.label}
              <span className="text-muted-foreground"> · {band.hint}</span>
            </Chip>
          ))}
        </ChoiceRow>

        <ChoiceRow label="Location">
          {DEMAND_BANDS.map((band) => (
            <Chip key={band.id} active={demand === band.id} onClick={() => setDemand(band.id)}>
              {band.label}
            </Chip>
          ))}
        </ChoiceRow>
      </div>

      <div className="rounded-2xl bg-accent-soft p-5 text-accent-foreground">
        <p className="type-label text-accent-foreground/80">Estimated monthly earnings</p>
        <p className="mt-1 type-h2 tabular-nums" aria-live="polite">
          {formatEarningsRange(range)}
        </p>
        <p className="mt-2 type-badge text-accent-foreground/70">
          Indicative only. Your actual price is set by you and depends on demand, size and access.
        </p>
        <div className="mt-4">
          <HostEntryButton label="List my space" from="homepage_earnings_estimator" block />
        </div>
      </div>
    </div>
  );
}

function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-4">
      <legend className="type-label text-muted-foreground">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-3.5 type-label transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}
