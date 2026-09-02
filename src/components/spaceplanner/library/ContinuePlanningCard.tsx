/**
 * ContinuePlanningCard — the "pick up where you left off" surface.
 */
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PlanPreview } from "@/components/spaceplanner/library/PlanPreview";
import { bandFor } from "@/lib/spaceplanner";
import {
  formatVolume,
  relativeTime,
  spaceFor,
  summarise,
  type SavedInventory,
} from "@/lib/spaceplanner/library";

export interface ContinuePlanningCardProps {
  inventory: SavedInventory;
  onOpen: (inventory: SavedInventory) => void;
  className?: string;
}

export function ContinuePlanningCard({
  inventory,
  onOpen,
  className,
}: ContinuePlanningCardProps) {
  const summary = summarise(inventory);
  const space = spaceFor(inventory);

  return (
    <section
      className={cn(
        "grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[10rem_1fr] sm:items-center sm:p-5",
        className,
      )}
    >
      <PlanPreview inventory={inventory} />
      <div className="min-w-0">
        <p className="type-label text-muted-foreground">Continue planning</p>
        <h2 className="mt-1 type-h2 text-xl">{inventory.name}</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {summary.itemCount} item{summary.itemCount === 1 ? "" : "s"} ·{" "}
          {formatVolume(summary.estimatedStorageVolume)} estimated · {space.name}
          {inventory.lastScore === null
            ? ""
            : ` · EarnRoom AI ${inventory.lastScore} (${bandFor(inventory.lastScore)})`}
        </p>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Last opened {relativeTime(inventory.lastOpenedAt ?? inventory.updatedAt)}
        </p>
        <Button className="mt-4" onClick={() => onOpen(inventory)}>
          Continue
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
