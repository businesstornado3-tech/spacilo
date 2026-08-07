/**
 * Step 3 — the planner thinking out loud.
 *
 * Not a spinner and not a fake progress bar: each line names a real step of
 * the deterministic pipeline, and the list is announced politely to screen
 * readers as it advances. With reduced motion the whole list is shown at once.
 */
import * as React from "react";
import { Check, Loader } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import { THINKING_STAGES } from "@/lib/spaceplanner";

export function AIThinkingTimeline({ onComplete }: { onComplete: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = React.useState(0);
  const done = React.useRef(false);

  React.useEffect(() => {
    done.current = false;
    if (reduced) {
      setActive(THINKING_STAGES.length);
      const id = window.setTimeout(() => {
        if (!done.current) {
          done.current = true;
          onComplete();
        }
      }, 120);
      return () => window.clearTimeout(id);
    }

    const timers: number[] = [];
    let elapsed = 0;
    THINKING_STAGES.forEach((stage, index) => {
      elapsed += stage.duration;
      timers.push(window.setTimeout(() => setActive(index + 1), elapsed));
    });
    timers.push(
      window.setTimeout(() => {
        if (!done.current) {
          done.current = true;
          onComplete();
        }
      }, elapsed + 260),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [reduced, onComplete]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="type-label">Spacilo AI is planning your space</p>
      <ol className="mt-3 grid gap-1.5" aria-live="polite">
        {THINKING_STAGES.map((stage, index) => {
          const complete = index < active;
          const current = index === active;
          return (
            <li
              key={stage.id}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-300",
                current && "bg-signal-soft/50",
                !complete && !current && "opacity-45",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  complete ? "bg-success text-success-foreground" : "bg-surface text-muted-foreground",
                )}
              >
                {complete ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : (
                  <Loader
                    className={cn("size-3", current && "motion-safe:animate-spin")}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="min-w-0 truncate type-body-sm">
                {stage.label}
                {complete ? "" : current ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
