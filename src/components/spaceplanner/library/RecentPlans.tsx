/**
 * RecentPlans — the recently used inventories row.
 *
 * A compact, scannable strip: the most recently opened inventories first, each
 * with its preview, score and the moment it was last touched.
 */
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { PlanPreview } from "@/components/spaceplanner/library/PlanPreview";
import {
  formatVolume,
  liveInventories,
  relativeTime,
  summarise,
  type SavedInventory,
} from "@/lib/spaceplanner/library";

export interface RecentPlansProps {
  inventories: SavedInventory[];
  onOpen: (inventory: SavedInventory) => void;
  limit?: number;
  className?: string;
}

export function RecentPlans({ inventories, onOpen, limit = 4, className }: RecentPlansProps) {
  const recent = liveInventories(inventories).slice(0, limit);
  if (recent.length === 0) return null;

  return (
    <section className={cn("", className)} aria-labelledby="recent-plans-heading">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="recent-plans-heading" className="type-h3 text-base">
          Recently used
        </h2>
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {recent.map((inventory) => {
          const summary = summarise(inventory);
          return (
            <li key={inventory.id}>
              <button
                type="button"
                onClick={() => onOpen(inventory)}
                className="w-full rounded-2xl border border-border bg-card p-3 text-left transition-shadow hover:shadow-card"
              >
                <PlanPreview inventory={inventory} />
                <p className="mt-2 truncate type-label">{inventory.name}</p>
                <p className="truncate type-body-sm text-muted-foreground">
                  {summary.itemCount} items · {formatVolume(summary.estimatedStorageVolume)}
                </p>
                <p className="truncate type-body-sm text-muted-foreground">
                  Last opened {relativeTime(inventory.lastOpenedAt ?? inventory.updatedAt)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
