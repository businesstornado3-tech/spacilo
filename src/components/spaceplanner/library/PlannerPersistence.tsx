/**
 * PlannerPersistence — save and autosave for an open inventory.
 *
 * Mounted inside a `SpacePlannerProvider`, it mirrors planner state back into
 * the saved record: quantities and space are debounced-saved as they change,
 * and every completed optimisation is written to plan history. The visible
 * part is small on purpose — a status line and a manual save.
 */
import * as React from "react";
import { Check, Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSpacePlanner } from "@/components/spaceplanner/SpacePlannerProvider";
import { usePlannerLibraryMutations } from "@/hooks/usePlannerLibrary";
import { fromQuantities, relativeTime, type SavedInventory } from "@/lib/spaceplanner/library";

const AUTOSAVE_DELAY_MS = 800;

export interface PlannerPersistenceProps {
  inventory: SavedInventory;
  className?: string;
}

export function PlannerPersistence({ inventory, className }: PlannerPersistenceProps) {
  const { quantities, space, score, phase, itemCount } = useSpacePlanner();
  const { save, record } = usePlannerLibraryMutations();
  const [savedAt, setSavedAt] = React.useState<string>(inventory.updatedAt);
  const [dirty, setDirty] = React.useState(false);

  const serialised = JSON.stringify(fromQuantities(quantities));
  const initial = React.useRef(true);
  const saveRef = React.useRef(save);
  saveRef.current = save;

  /** Autosave: any inventory or space change persists shortly afterwards. */
  React.useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    setDirty(true);
    const timer = window.setTimeout(() => {
      saveRef.current.mutate(
        { id: inventory.id, patch: { lines: JSON.parse(serialised), spaceId: space.id } },
        {
          onSuccess: (next) => {
            setSavedAt(next.updatedAt);
            setDirty(false);
          },
        },
      );
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [serialised, space.id, inventory.id]);

  /** Plan history: one row per completed optimisation run. */
  const recordRef = React.useRef(record);
  recordRef.current = record;
  const lastRun = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (phase !== "plan" || !score) return;
    const signature = `${serialised}|${space.id}|${score.value}`;
    if (lastRun.current === signature) return;
    lastRun.current = signature;

    recordRef.current.mutate({
      inventoryId: inventory.id,
      inventoryName: inventory.name,
      spaceId: space.id,
      spaceName: space.name,
      score: score.value,
      fitPercent: score.fitPercent,
      complexity: score.complexity,
      recommendation: score.recommendation,
      itemCount,
    });
    saveRef.current.mutate({ id: inventory.id, patch: { lastScore: score.value } });
  }, [phase, score, serialised, space.id, space.name, inventory.id, inventory.name, itemCount]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 type-body-sm text-muted-foreground", className)}>
      {dirty ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Saving changes…
        </>
      ) : (
        <>
          <Check className="size-4 text-success" aria-hidden="true" />
          Saved {relativeTime(savedAt)}
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={() =>
          save.mutate(
            {
              id: inventory.id,
              patch: { lines: fromQuantities(quantities), spaceId: space.id },
            },
            {
              onSuccess: (next) => {
                setSavedAt(next.updatedAt);
                setDirty(false);
              },
            },
          )
        }
      >
        <Save className="size-4" aria-hidden="true" />
        Save plan
      </Button>
    </div>
  );
}
