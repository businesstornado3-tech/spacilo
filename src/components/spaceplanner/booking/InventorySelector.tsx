/**
 * InventorySelector — choose which saved inventory to plan with.
 *
 * Reads the planner library directly, so the same saved inventories a renter
 * built in their workspace are the ones offered on a listing.
 */
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatVolume, summarise, type SavedInventory } from "@/lib/spaceplanner/library";

export function InventorySelector({
  inventories,
  selectedId,
  onSelect,
  className,
}: {
  inventories: SavedInventory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (!inventories.length) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border bg-surface p-4", className)}>
        <p className="flex items-center gap-2 type-label">
          <Boxes className="size-4 text-primary" aria-hidden="true" />
          No saved inventories yet
        </p>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Add what you&apos;re storing once and EarnRoom AI can check it against any listing.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link to="/planner">Create an inventory</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {inventories.map((inventory) => {
        const summary = summarise(inventory);
        const selected = inventory.id === selectedId;
        return (
          <button
            key={inventory.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(inventory.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              selected
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-surface hover:border-primary/30",
            )}
          >
            <span className="block truncate type-label">{inventory.name}</span>
            <span className="block type-badge text-muted-foreground">
              {summary.itemCount} item{summary.itemCount === 1 ? "" : "s"} ·{" "}
              {formatVolume(summary.estimatedStorageVolume)} estimated
            </span>
          </button>
        );
      })}
    </div>
  );
}
