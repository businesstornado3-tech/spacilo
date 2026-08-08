/**
 * CoachMark — one calm, dismissible sentence for first-time users.
 *
 * Never blocks, never overlays, never queues. It sits inline above the thing
 * it describes, disappears for good once dismissed, and honours reduced
 * motion by skipping the entrance animation.
 */
import { Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useOnboardingHint } from "@/hooks/useOnboardingHint";
import { usePrefersReducedMotion } from "@/hooks/use-motion";
import type { OnboardingHintId } from "@/lib/onboarding/hints";

export function CoachMark({ id, className }: { id: OnboardingHintId; className?: string }) {
  const { visible, dismiss, copy } = useOnboardingHint(id);
  const reduced = usePrefersReducedMotion();

  if (!visible) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary-soft/60 px-3 py-2.5 text-left",
        !reduced && "animate-fade",
        className,
      )}
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 type-body-sm text-primary-soft-foreground">{copy}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="-m-1 grid size-8 shrink-0 place-items-center rounded-lg text-primary-soft-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary-soft-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
