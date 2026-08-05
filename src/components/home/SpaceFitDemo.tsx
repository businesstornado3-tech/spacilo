/**
 * Lightweight, deterministic SpaceFit demonstration for the hero.
 *
 * IMPORTANT: this is presentation only. It makes NO AI request, creates NO
 * scan session, uploads nothing and reads no user data. Every figure below is
 * a hard-coded illustrative example, labelled as such in the UI.
 *
 * Reduced-motion users get a stable panel carrying both benefits instead of
 * the rotating states.
 */
import * as React from "react";

import heroPhoto from "@/assets/hero-storage.jpg";
import { cn } from "@/lib/utils";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { usePrefersReducedMotion } from "@/hooks/use-motion";

export type DemoMode = "renter" | "host";

interface DemoState {
  mode: DemoMode;
  /** Progressive scanning lines, revealed one at a time. */
  steps: string[];
  resultLabel: string;
  resultValue: string;
  footnote: string;
}

/** Deterministic demonstration content. Illustrative examples, not user data. */
export const DEMO_STATES: readonly DemoState[] = [
  {
    mode: "renter",
    steps: [
      "Scanning belongings…",
      "14 items detected",
      "Estimated requirement ~3.1 m³",
      "Checking suitable spaces…",
    ],
    resultLabel: "Suitable storage nearby",
    resultValue: "94% SpaceFit*",
    footnote: "*Illustrative SpaceFit example — not your result.",
  },
  {
    mode: "host",
    steps: [
      "Scanning available space…",
      "Garage detected",
      "Usable capacity ~8.4 m³",
      "Storage potential calculated",
    ],
    resultLabel: "Potential earnings",
    resultValue: "£85–£115 / month*",
    footnote: "*Illustrative SpaceFit estimate — not guaranteed earnings.",
  },
] as const;

const STEP_MS = 1500;
const RESULT_MS = 3200;

export function SpaceFitDemo({
  className,
  onModeChange,
}: {
  className?: string | undefined;
  onModeChange?: (mode: DemoMode) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [step, setStep] = React.useState(0);

  const state = DEMO_STATES[index] as DemoState;
  const total = state.steps.length;

  React.useEffect(() => {
    if (reduced) return;
    const last = step >= total - 1;
    const timer = window.setTimeout(
      () => {
        if (last) {
          setStep(0);
          setIndex((i) => (i + 1) % DEMO_STATES.length);
        } else {
          setStep((s) => s + 1);
        }
      },
      last ? RESULT_MS : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reduced, step, total, index]);

  React.useEffect(() => {
    onModeChange?.(state.mode);
  }, [state.mode, onModeChange]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-card shadow-raised",
        className,
      )}
    >
      <img
        src={heroPhoto}
        alt="Household boxes, a bicycle and suitcases stored neatly in a British home garage"
        width={1600}
        height={1200}
        fetchPriority="high"
        className="aspect-[4/3] w-full object-cover"
      />

      {reduced ? (
        <div className="p-4 sm:p-5">
          <SpaceFitAiMark size="sm" />
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface p-3">
              <dt className="type-label">For renters</dt>
              <dd className="mt-1 type-body-sm text-muted-foreground">
                See how much storage you actually need.
              </dd>
            </div>
            <div className="rounded-2xl bg-surface p-3">
              <dt className="type-label">For hosts</dt>
              <dd className="mt-1 type-body-sm text-muted-foreground">
                See what your spare space could earn.
              </dd>
            </div>
          </dl>
          <p className="mt-3 type-body-sm text-muted-foreground">
            Illustrative examples — your own scan gives your own numbers.
          </p>
        </div>
      ) : (
        <div
          className="p-4 sm:p-5"
          // Announce quietly, once settled, rather than on every frame.
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SpaceFitAiMark size="sm" />
            <span className="type-overline text-muted-foreground">
              {state.mode === "renter" ? "Renter example" : "Host example"}
            </span>
          </div>

          <ul className="mt-3 grid gap-1.5">
            {state.steps.map((line, i) => (
              <li
                key={line}
                className={cn(
                  "type-body-sm transition-opacity duration-500 motion-reduce:transition-none",
                  i <= step ? "opacity-100" : "opacity-0",
                  i === total - 1 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {line}
              </li>
            ))}
          </ul>

          <div
            className={cn(
              "mt-3 rounded-2xl bg-signal-soft p-3 transition-opacity duration-500 motion-reduce:transition-none",
              step >= total - 1 ? "opacity-100" : "opacity-0",
            )}
          >
            <p className="type-overline text-signal-soft-foreground">{state.resultLabel}</p>
            <p className="mt-0.5 type-h3 tabular-nums">{state.resultValue}</p>
          </div>

          <p className="mt-2 type-body-sm text-muted-foreground">{state.footnote}</p>
        </div>
      )}
    </div>
  );
}
