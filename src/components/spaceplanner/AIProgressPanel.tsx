/**
 * AIProgressPanel — the planner thinking out loud.
 *
 * Wraps the existing timeline and completes the run through shared state, so
 * every surface advances the same way.
 */
import { AIThinkingTimeline } from "@/components/spaceplanner/AIThinkingTimeline";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export function AIProgressPanel({ onComplete }: { onComplete?: () => void } = {}) {
  const { completeRun } = useSpacePlanner();
  return (
    <AIThinkingTimeline
      onComplete={() => {
        completeRun();
        onComplete?.();
      }}
    />
  );
}
