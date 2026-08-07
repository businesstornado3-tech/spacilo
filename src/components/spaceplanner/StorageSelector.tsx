/**
 * Step 2 — choose a storage space.
 *
 * Each card shows the usable dimensions, volume, ceiling height and door the
 * planner reasons about. These are representative space types, not listings.
 */
import { cn } from "@/lib/utils";
import { DEMO_SPACES, usableVolume, type StorageSpace } from "@/lib/spaceplanner";

export function StorageSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (space: StorageSpace) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {DEMO_SPACES.map((space) => {
        const selected = space.id === selectedId;
        return (
          <li key={space.id}>
            <button
              type="button"
              onClick={() => onSelect(space)}
              aria-pressed={selected}
              className={cn(
                "h-full w-full rounded-2xl border p-4 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
                selected
                  ? "border-signal bg-signal-soft/40 shadow-card"
                  : "border-border bg-card hover:border-border-strong",
              )}
            >
              <p className="type-card-title">{space.name}</p>
              <p className="mt-1 type-body-sm text-muted-foreground">{space.blurb}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Fact label="Usable" value={`${space.width}m × ${space.depth}m`} />
                <Fact label="Ceiling" value={`${space.height}m`} />
                <Fact label="Volume" value={`~${usableVolume(space)}m³`} />
                <Fact label="Door" value={`${space.doorWidth}m wide`} />
              </dl>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-overline text-muted-foreground">{label}</dt>
      <dd className="type-body-sm">{value}</dd>
    </div>
  );
}
