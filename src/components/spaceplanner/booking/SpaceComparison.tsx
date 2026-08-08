/**
 * SpaceComparison — several saved inventories against one listing.
 *
 * Each row is a full deterministic run of the planner for that inventory in
 * this space, so the ranking is comparable and repeatable.
 */
import { cn } from "@/lib/utils";
import { CompatibilityBadge } from "@/components/spaceplanner/booking/CompatibilityBadge";
import type { ComparisonResult } from "@/lib/spaceplanner/booking-confidence";

export function SpaceComparison({
  results,
  selectedId,
  onSelect,
  className,
}: {
  results: ComparisonResult[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  if (results.length < 2) return null;

  return (
    <section
      aria-labelledby="inventory-comparison"
      className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}
    >
      <h3 id="inventory-comparison" className="type-h4">
        Your inventories in this space
      </h3>
      <p className="mt-1 type-body-sm text-muted-foreground">
        The same listing, scored against everything you&apos;ve saved.
      </p>
      <ul className="mt-3 grid gap-2">
        {results.map((result) => {
          const selected = result.id === selectedId;
          return (
            <li key={result.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect?.(result.id)}
                disabled={!onSelect}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-surface enabled:hover:border-primary/30",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate type-label">{result.name}</span>
                  <span className="block type-badge text-muted-foreground">
                    {result.itemCount} item{result.itemCount === 1 ? "" : "s"} · fit{" "}
                    {result.fitPercent}% · {result.recommendation}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="type-h4 tabular-nums">{result.score}</span>
                  <CompatibilityBadge tone={result.tone}>{result.band}</CompatibilityBadge>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
