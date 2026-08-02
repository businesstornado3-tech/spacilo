import * as React from "react";
import { Search, Sparkles } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "@/components/inventory/QuantityStepper";
import {
  QUICK_ADD_FILTERS,
  searchCatalogue,
  type CatalogueItem,
} from "@/lib/inventory-catalogue";
import { formatDimensions, formatVolume, unitVolumeM3, type InventoryItem } from "@/lib/inventory-model";

/**
 * Fast catalogue-driven add experience. Quantity changes write straight
 * through to the inventory (optimistically) so a renter can build a basic
 * list in well under two minutes without opening a single form.
 */
export function QuickAdd({
  items,
  onQuantityChange,
  onAddCustom,
}: {
  items: InventoryItem[];
  onQuantityChange: (entry: CatalogueItem, quantity: number) => void;
  onAddCustom: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("popular");

  const results = React.useMemo(() => searchCatalogue(query, filter), [query, filter]);

  const quantityFor = React.useCallback(
    (key: string) => items.find((item) => item.catalogue_key === key)?.quantity ?? 0,
    [items],
  );

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items..."
          aria-label="Search items"
          className="h-12 pl-9"
        />
      </div>

      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 pb-1">
          {QUICK_ADD_FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={!query && filter === chip.id}
              onClick={() => {
                setQuery("");
                setFilter(chip.id);
              }}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-4 type-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !query && filter === chip.id
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-card p-6 text-center">
          <p className="type-body">No matching items.</p>
          <Button className="mt-4" onClick={onAddCustom}>
            Add custom item
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {results.map((entry) => {
            const quantity = quantityFor(entry.key);
            const unit = unitVolumeM3(entry.lengthCm, entry.widthCm, entry.heightCm);
            return (
              <li key={entry.key}>
                <div
                  className={cn(
                    "flex h-full items-center gap-3 rounded-2xl border bg-card p-3 transition-colors",
                    quantity > 0 ? "border-primary shadow-card" : "border-border",
                  )}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <entry.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body font-semibold">{entry.name}</p>
                    <p className="truncate type-body-sm text-muted-foreground">
                      Approx. {formatDimensions(entry.lengthCm, entry.widthCm, entry.heightCm)}
                    </p>
                    {quantity > 0 && unit ? (
                      <p className="type-body-sm text-primary">
                        Approx. item volume: {formatVolume(unit * quantity)}
                      </p>
                    ) : null}
                  </div>
                  <QuantityStepper
                    value={quantity}
                    onChange={(next) => onQuantityChange(entry, next)}
                    label={entry.name}
                    size="sm"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-secondary/60 p-4 text-center">
        <p className="type-body-sm text-muted-foreground">
          <Badge variant="neutral" size="sm" className="mr-2 align-middle">
            <Sparkles aria-hidden="true" />
            Typical estimate
          </Badge>
          Catalogue sizes are typical estimates. You can edit any measurement.
        </p>
        <p className="mt-3 type-body font-semibold">Can&apos;t find your item?</p>
        <Button variant="secondary" className="mt-2" onClick={onAddCustom}>
          Add custom item
        </Button>
      </div>
    </div>
  );
}
