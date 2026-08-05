/**
 * Renter-facing trust panel. Shows facts and gaps side by side — a missing
 * check is never hidden, and nothing here claims a space is safe.
 */
import { BadgeCheck, CircleDashed, Info, Ruler } from "lucide-react";

import {
  TRUST_DISCLAIMER,
  TRUST_TONE_LABEL,
  type TrustSignal,
  type TrustSummary,
} from "@/lib/trust/signals";

const ICON = {
  verified: BadgeCheck,
  declared: Info,
  estimated: Ruler,
  absent: CircleDashed,
} as const;

const TONE_CLASS: Record<TrustSignal["tone"], string> = {
  verified: "text-success",
  declared: "text-muted-foreground",
  estimated: "text-primary",
  absent: "text-muted-foreground",
};

function SignalRow({ signal }: { signal: TrustSignal }) {
  const Icon = ICON[signal.tone];
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_CLASS[signal.tone]}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="type-body-sm font-semibold">{signal.label}</p>
        <p className="type-body-sm text-muted-foreground">{signal.detail}</p>
        <p className="mt-0.5 type-label text-muted-foreground">{TRUST_TONE_LABEL[signal.tone]}</p>
      </div>
    </li>
  );
}

export function TrustSignals({ summary }: { summary: TrustSummary }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="type-h3">What we can tell you</h2>
      <p className="mt-1 type-body-sm text-muted-foreground">{summary.headline}</p>

      <ul className="mt-3 divide-y divide-border">
        {summary.signals.map((signal) => (
          <SignalRow key={signal.key} signal={signal} />
        ))}
      </ul>

      {summary.gaps.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <h3 className="type-label text-muted-foreground">Not provided</h3>
          <ul className="mt-1 divide-y divide-border">
            {summary.gaps.map((signal) => (
              <SignalRow key={signal.key} signal={signal} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 type-body-sm text-muted-foreground">{TRUST_DISCLAIMER}</p>
    </section>
  );
}
