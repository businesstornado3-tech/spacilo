/**
 * Step 1 — choose belongings.
 *
 * Illustrated object cards with quantity steppers. Every card shows the real
 * artwork the plan will use, so what a visitor picks is what they see packed.
 */
import * as React from "react";
import { Minus, Plus, Search, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { ObjectIllustration } from "@/components/spaceplanner/ObjectArt";
import {
  INVENTORY_PRESETS,
  
  searchCatalogue,
  type CatalogueItem,
} from "@/lib/spaceplanner";

export interface InventoryBuilderProps {
  quantities: Record<string, number>;
  onChange: (itemId: string, quantity: number) => void;
  onPreset: (lines: Array<{ itemId: string; quantity: number }>, presetName: string) => void;
  onClear: () => void;
}

/** The belongings almost every visitor recognises — the compact default set. */
const COMMON_ITEM_IDS = ["medium-box", "large-box", "bicycle", "television"];

export function InventoryBuilder({
  quantities,
  onChange,
  onPreset,
  onClear,
}: InventoryBuilderProps) {
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const matches = React.useMemo(() => searchCatalogue(query), [query]);
  const compact = !expanded && query.trim() === "";
  const results = React.useMemo(
    () =>
      compact
        ? matches.filter(
            (item) => COMMON_ITEM_IDS.includes(item.id) || (quantities[item.id] ?? 0) > 0,
          )
        : matches,
    [compact, matches, quantities],
  );
  const hidden = matches.length - results.length;
  const total = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {INVENTORY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPreset(preset.lines, preset.name)}
            title={preset.description}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 type-badge transition-colors hover:border-primary hover:bg-primary-soft/50"
          >
            <Sparkles className="size-3.5 text-primary-soft-foreground" aria-hidden="true" />
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
          className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 type-body-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
        />
      </div>

      <ul className="mt-3 grid grid-cols-4 gap-1.5">
        {results.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            quantity={quantities[item.id] ?? 0}
            onChange={(next) => onChange(item.id, next)}
            revealed={index >= COMMON_ITEM_IDS.length}
          />
        ))}
      </ul>

      {hidden > 0 || (expanded && query.trim() === "") ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-card px-4 type-label transition-colors hover:border-primary hover:bg-primary-soft/40"
          >
            {expanded ? "Show fewer items" : "Show more items"}
          </button>
        </div>
      ) : null}

      {results.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface p-4 type-body-sm text-muted-foreground">
          Nothing here matches “{query}”.
        </p>
      ) : null}
    </div>
  );
}

function ItemCard({
  item,
  quantity,
  onChange,
  revealed,
}: {
  item: CatalogueItem;
  quantity: number;
  onChange: (quantity: number) => void;
  revealed?: boolean;
}) {
  const selected = quantity > 0;

  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-xl border p-1.5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0",
        selected ? "border-primary/60 bg-primary-soft/25 shadow-card" : "border-border bg-card",
        revealed && "duration-300 animate-in fade-in slide-in-from-top-1",
      )}
    >
      <button
        type="button"
        onClick={() => onChange(quantity > 0 ? 0 : 1)}
        aria-pressed={selected}
        aria-label={`${selected ? "Remove" : "Add"} ${item.name}`}
        className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block rounded-lg bg-scene-wall p-0.5">
          <ObjectIllustration
            icon={item.icon}
            className={cn(
              "aspect-3/2 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none",
              selected && "scale-105",
            )}
          />
        </span>
        <span className="mt-1 block truncate text-left type-badge text-foreground">
          {item.name}
        </span>
      </button>

      <div className="mt-1 flex items-center justify-between gap-0.5">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface disabled:opacity-40"
          aria-label={`Remove one ${item.name}`}
          disabled={quantity === 0}
          onClick={() => onChange(Math.max(0, quantity - 1))}
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <span className="type-badge tabular-nums" aria-label={`${quantity} ${item.name} selected`}>
          {quantity}
        </span>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface disabled:opacity-40"
          aria-label={`Add one ${item.name}`}
          disabled={quantity >= 24}
          onClick={() => onChange(quantity + 1)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
