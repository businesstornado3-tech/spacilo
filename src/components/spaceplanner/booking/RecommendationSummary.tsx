/**
 * RecommendationSummary — what Spacilo AI suggests, with live scoring.
 *
 * Toggling a suggestion re-runs the deterministic engine, so the score above
 * moves for a real reason. Nothing is saved and nothing is sent to the host.
 */
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PlannerSuggestion } from "@/lib/spaceplanner/booking-confidence";

export function RecommendationSummary({
  suggestions,
  applied,
  onToggle,
  explanations = [],
  className,
}: {
  suggestions: PlannerSuggestion[];
  applied: string[];
  onToggle: (id: string) => void;
  explanations?: string[];
  className?: string;
}) {
  if (!suggestions.length && !explanations.length) return null;

  return (
    <section
      aria-labelledby="planner-suggestions"
      className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}
    >
      <h3 id="planner-suggestions" className="flex items-center gap-2 type-h4">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        Packing suggestions
      </h3>

      {suggestions.length ? (
        <>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Try a change to see how the score moves.
          </p>
          <ul className="mt-3 grid gap-2">
            {suggestions.map((suggestion) => {
              const isOn = applied.includes(suggestion.id);
              return (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => onToggle(suggestion.id)}
                    className={cn(
                      "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      isOn
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-surface hover:border-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 place-items-center rounded-md border",
                        isOn ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                      aria-hidden="true"
                    >
                      {isOn ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block type-label">{suggestion.label}</span>
                      <span className="block type-badge text-muted-foreground">
                        {suggestion.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-1 type-body-sm text-muted-foreground">
          No changes needed — the plan already clears every check.
        </p>
      )}

      {explanations.length ? (
        <ul className="mt-4 grid gap-2 border-t border-border pt-4">
          {explanations.map((line) => (
            <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
              <p className="type-body-sm text-muted-foreground">{line}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
