/**
 * RecommendationPanel — what EarnRoom AI suggests, and why.
 *
 * Every line comes from the placements actually drawn (`plan.explanations`)
 * plus the deterministic score checks, so nothing here is marketing copy.
 */
import { AlertTriangle, Info } from "lucide-react";

import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export function RecommendationPanel() {
  const { plan, score } = useSpacePlanner();
  if (!plan || !score) return null;

  const actions = score.checks
    .filter((check) => check.state !== "passed")
    .map((check) => `${check.label}: ${check.detail}.`);

  return (
    <section
      aria-labelledby="planner-recommendations"
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h3 id="planner-recommendations" className="flex items-center gap-2 type-h4">
        <Info className="size-4 text-signal-soft-foreground" aria-hidden="true" />
        Why EarnRoom AI planned it this way
      </h3>
      <ul className="mt-3 grid gap-2.5">
        {[...plan.explanations, ...actions].map((line) => (
          <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
            <p className="type-body-sm text-muted-foreground">{line}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface p-3 type-badge text-muted-foreground">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        These are estimates from typical dimensions, not a survey. You and your host confirm what
        actually fits before anything is booked.
      </p>
    </section>
  );
}
