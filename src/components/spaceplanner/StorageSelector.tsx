/**
 * Step 2 — choose a storage space.
 *
 * Each card shows a miniature illustration of the room plus the usable
 * dimensions the planner reasons about. Representative space types, not
 * listings.
 */
import { cn } from "@/lib/utils";
import { RoomIllustration } from "@/components/spaceplanner/RoomArt";
import { DEMO_SPACES, usableVolume, type StorageSpace } from "@/lib/spaceplanner";

export function StorageSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (space: StorageSpace) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {DEMO_SPACES.map((space) => {
        const selected = space.id === selectedId;
        return (
          <li key={space.id}>
            <button
              type="button"
              onClick={() => onSelect(space)}
              aria-pressed={selected}
              className={cn(
                "h-full w-full overflow-hidden rounded-2xl border p-2.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0",
                selected
                  ? "border-primary/60 bg-primary-soft/25 shadow-card"
                  : "border-border bg-card hover:border-border-strong",
              )}
            >
              <span className="block overflow-hidden rounded-xl">
                <RoomIllustration kind={space.kind} />
              </span>
              <p className="mt-2 truncate type-label">{space.name}</p>
              <p className="type-badge text-muted-foreground">
                {space.width}m × {space.depth}m · ~{usableVolume(space)}m³
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
