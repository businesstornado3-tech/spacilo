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

const COMMON_SPACE_IDS = ["garage", "bedroom", "loft", "storage-room"];

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
    : DEMO_SPACES.filter((space) => COMMON_SPACE_IDS.includes(space.id)).slice(0, 4);
  const hidden = DEMO_SPACES.length - visible.length;

  return (
    <div>
      <ul className="grid grid-cols-4 gap-1.5">
        {visible.map((space, index) => {
          const selected = space.id === selectedId;
          return (
            <li
              key={space.id}
              className={cn(
                index >= COMMON_SPACE_IDS.length &&
                  "duration-300 animate-in fade-in slide-in-from-top-1",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(space)}
                aria-pressed={selected}
                className={cn(
                  "h-full w-full overflow-hidden rounded-lg border p-1 text-left transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0",
                  selected
                    ? "border-primary/60 bg-primary-soft/25 shadow-card"
                    : "border-border bg-card hover:border-border-strong",
                )}
              >
                <span className="block overflow-hidden rounded-md">
                  <RoomIllustration kind={space.kind} />
                </span>
                <p className="mt-0.5 truncate text-[0.6875rem] leading-4 text-foreground">
                  {space.name}
                </p>
                <p className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
                  {space.width}m × {space.depth}m
                </p>
              </button>
            </li>
          );
        })}
      </ul>


      {hidden > 0 || expanded ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-card px-4 type-label transition-colors hover:border-primary hover:bg-primary-soft/40"
          >
            {expanded ? "Show fewer spaces" : "Show more spaces"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
