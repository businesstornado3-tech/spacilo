/**
 * UnlockCard — shown only after a visitor has experienced a full plan.
 *
 * The magic comes first: nothing here interrupts the run, and the card never
 * appears before the planner has finished its work.
 */
import { Check, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { UNLOCK_BENEFITS } from "@/lib/spaceplanner";

export function UnlockCard() {
  return (
    <section
      aria-labelledby="planner-unlock"
      className="overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <p className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        You've just seen the preview
      </p>
      <h3 id="planner-unlock" className="mt-3 type-h3">
        Unlock Spacilo AI
      </h3>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Create your free account to unlock the complete planner.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {UNLOCK_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 type-body-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            {benefit}
          </li>
        ))}
      </ul>

      <Button asChild size="lg" className="mt-5 w-full sm:w-auto">
        <Link to="/signup" search={{ mode: "renter" }}>
          Create free account
        </Link>
      </Button>
    </section>
  );
}
