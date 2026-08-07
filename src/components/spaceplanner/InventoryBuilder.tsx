/**
 * Step 1 — choose belongings.
 *
 * Search, presets and quantity steppers over the demo catalogue. Every item
 * shows the estimate the planner will actually use, so nothing on the results
 * screen appears from nowhere.
 */
import * as React from "react";
import { Minus, Plus, Search, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { iconFor } from "@/components/spaceplanner/icons";
import {
  CATEGORY_LABELS,
  INVENTORY_PRESETS,
  itemVolume,
  searchCatalogue,
  type CatalogueItem,
} from "@/lib/spaceplanner";

export interface InventoryBuilderProps {
  quantities: Record<string, number>;
  onChange: (itemId: string, quantity: number) => void;
  onPreset: (lines: Array<{ itemId: string; quantity: number }>, presetName: string) => void;
  onClear: () => void;
}

export function InventoryBuilder({
  quantities,
  onChange,
  onPreset,
  onClear,
}: InventoryBuilderProps) {
  const [query, setQuery] = React.useState("");
  const results = React.useMemo(() => searchCatalogue(query), [query]);
  const total = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label text-muted-foreground">Popular starting points</span>
        {INVENTORY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPreset(preset.lines, preset.name)}
            title={preset.description}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 type-badge transition-colors hover:border-signal hover:bg-signal-soft/50"
          >
            <Sparkles className="size-3.5 text-signal-soft-foreground" aria-hidden="true" />
            {preset.name}
          </button>
        ))}
        {total > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-9 rounded-full px-3 type-badge text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search belongings — boxes, bike, mattress…"
          aria-label="Search demo belongings"
          className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 type-body-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
        />
      </div>

      <ul className="mt-4 grid gap-2 xl:grid-cols-2">
        {results.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            quantity={quantities[item.id] ?? 0}
            onChange={(next) => onChange(item.id, next)}
          />
        ))}
      </ul>

      {results.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface p-4 type-body-sm text-muted-foreground">
          Nothing in the demo catalogue matches “{query}”. The full product recognises far more —
          this preview keeps to a fixed set so the maths stays checkable.
        </p>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  quantity,
  onChange,
}: {
  item: CatalogueItem;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const Icon = iconFor(item.icon);
  const selected = quantity > 0;

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border p-3 transition-colors",
        selected ? "border-signal/50 bg-signal-soft/35" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          selected ? "bg-signal-soft text-signal-soft-foreground" : "bg-surface text-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="type-label">{item.name}</p>
        <p className="type-badge text-muted-foreground">
          {item.width}×{item.depth}×{item.height}cm · ~{itemVolume(item).toFixed(2)}m³ ·{" "}
          {CATEGORY_LABELS[item.category]}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-1.5">
          <Flag>{item.weight === "heavy" ? "Heavy" : item.weight === "medium" ? "Medium" : "Light"}</Flag>
          {item.fragile ? <Flag tone="warning">Fragile</Flag> : null}
          {item.stackable ? <Flag tone="success">Stacks {item.maxStack} high</Flag> : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label={`Remove one ${item.name}`}
          disabled={quantity === 0}
          onClick={() => onChange(Math.max(0, quantity - 1))}
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>
        <span
          className="w-6 text-center type-label tabular-nums"
          aria-label={`${quantity} ${item.name} selected`}
        >
          {quantity}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label={`Add one ${item.name}`}
          disabled={quantity >= 24}
          onClick={() => onChange(quantity + 1)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function Flag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 type-badge",
        tone === "warning" && "bg-warning-soft text-warning-soft-foreground",
        tone === "success" && "bg-success-soft text-success-soft-foreground",
        tone === "neutral" && "bg-surface text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
