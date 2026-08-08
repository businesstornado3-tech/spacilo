/**
 * PhotoArrangement — the user's actual photograph, with their belongings
 * arranged inside it.
 *
 * The photo is the foundation: walls, floor, door and everything already in
 * the room stay exactly as photographed. Spacilo AI only draws the proposed
 * arrangement on top, in perspective, so the result reads as "that is my
 * space, and those are my things" rather than a generic 3D room.
 */
import * as React from "react";
import { MoveHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { projectPlacements, toPoints, DEFAULT_FLOOR_QUAD, type FloorQuad } from "@/lib/spaceplanner/photo";
import type { PackResult, StorageSpace } from "@/lib/spaceplanner";

export interface PhotoArrangementProps {
  /** The user's own photograph of the space. */
  photoUrl: string;
  photoAlt?: string;
  space: StorageSpace;
  pack: PackResult;
  quad?: FloorQuad;
  /** Text alternative describing the arrangement for assistive technology. */
  description: string;
  className?: string;
}

function Overlay({
  space,
  pack,
  quad,
}: {
  space: StorageSpace;
  pack: PackResult;
  quad: FloorQuad;
}) {
  const boxes = React.useMemo(
    () => projectPlacements(pack.placements, space, quad),
    [pack.placements, space, quad],
  );

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      {boxes.map((box) => (
        <g key={box.key}>
          <polygon
            points={toPoints(box.front)}
            className="fill-[var(--color-signal)]/55 stroke-[var(--color-signal)]"
            strokeWidth={0.25}
          />
          <polygon
            points={toPoints(box.top)}
            className="fill-[var(--color-signal)]/80 stroke-[var(--color-signal)]"
            strokeWidth={0.25}
          />
        </g>
      ))}
    </svg>
  );
}

export function PhotoArrangement({
  photoUrl,
  photoAlt = "The space you photographed",
  space,
  pack,
  quad = DEFAULT_FLOOR_QUAD,
  description,
  className,
}: PhotoArrangementProps) {
  const [showArranged, setShowArranged] = React.useState(true);
  const [position, setPosition] = React.useState(100);

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
        <img
          src={photoUrl}
          alt={photoAlt}
          loading="lazy"
          decoding="async"
          className="block aspect-[4/3] w-full object-cover"
        />
        {showArranged ? (
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <Overlay space={space} pack={pack} quad={quad} />
          </div>
        ) : null}

        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 type-badge">
          {showArranged ? "AI arranged" : "Original"}
        </span>

        {showArranged && position > 2 && position < 98 ? (
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-signal"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-signal text-signal-foreground shadow-raised">
              <MoveHorizontal className="size-4" aria-hidden="true" />
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-surface p-1" role="group" aria-label="Compare original and AI arranged">
          <button
            type="button"
            onClick={() => setShowArranged(false)}
            aria-pressed={!showArranged}
            className={cn(
              "rounded-full px-3 py-1.5 type-badge",
              !showArranged && "bg-card shadow-card",
            )}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => setShowArranged(true)}
            aria-pressed={showArranged}
            className={cn(
              "rounded-full px-3 py-1.5 type-badge",
              showArranged && "bg-card shadow-card",
            )}
          >
            AI arranged
          </button>
        </div>

        <label className="min-w-[10rem] flex-1">
          <span className="sr-only">Reveal the AI arrangement</span>
          <input
            type="range"
            min={0}
            max={100}
            value={position}
            disabled={!showArranged}
            onChange={(event) => setPosition(Number(event.target.value))}
            className="h-11 w-full accent-[var(--color-signal)]"
            aria-label="Reveal the AI arrangement across your photo"
          />
        </label>
      </div>

      <figcaption className="mt-2 type-body-xs text-muted-foreground">{description}</figcaption>
    </figure>
  );
}
