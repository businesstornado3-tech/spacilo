/**
 * Step 2 — choose a storage space.
 *
 * Each card shows a miniature illustration of the room plus the usable
 * dimensions the planner reasons about. Representative space types, not
 * listings. The common six show by default; the rest are one tap away.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { RoomIllustration } from "@/components/spaceplanner/RoomArt";
import { DEMO_SPACES, usableVolume, type StorageSpace } from "@/lib/spaceplanner";

const COMMON_SPACE_IDS = ["garage", "loft", "bedroom", "storage-room", "commercial", "parking"];

export function StorageSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (space: StorageSpace) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded
    ? DEMO_SPACES
    : DEMO_SPACES.filter(
        (space) => COMMON_SPACE_IDS.includes(space.id) || space.id === selectedId,
      );
  const hidden = DEMO_SPACES.length - visible.length;

  return (
    <div>
      <ul className="grid grid-cols-2 gap-2.5">
        {visible.map((space) => {
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

      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-card type-label transition-colors hover:border-primary hover:bg-primary-soft/40"
        >
          {expanded ? "Show fewer spaces" : `Show more spaces (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}
