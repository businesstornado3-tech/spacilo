/**
 * PlannerToolbar — the mode-aware action row.
 *
 * Actions the current mode cannot perform are simply absent, never disabled
 * decoration: visitors see "Plan my storage" and "Adjust", renters and hosts
 * see the same plus the surfaces their capabilities unlock.
 */
import { ArrowRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";

export interface PlannerToolbarProps {
  onRun?: () => void;
  onSave?: () => void;
  onCompare?: () => void;
}

export function PlannerToolbar({ onRun, onSave, onCompare }: PlannerToolbarProps) {
  const { phase, itemCount, run, setPhase, capabilities } = useSpacePlanner();

  if (phase === "plan") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPhase("build")}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Adjust
        </Button>
        {capabilities.canSavePlans && onSave ? (
          <Button variant="secondary" size="sm" onClick={onSave}>
            Save plan
          </Button>
        ) : null}
        {capabilities.canCompareSpaces && onCompare ? (
          <Button variant="secondary" size="sm" onClick={onCompare}>
            Compare spaces
          </Button>
        ) : null}
      </div>
    );
  }

  if (phase === "thinking") return null;

  return (
    <Button
      block
      size="lg"
      disabled={itemCount === 0}
      onClick={() => {
        run();
        onRun?.();
      }}
    >
      Plan my storage
      <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  );
}
