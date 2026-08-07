/**
 * Before / after comparison.
 *
 * A draggable wipe on top of the two real packs. The handle is a native range
 * input, so it is keyboard operable and announced correctly; pointer dragging
 * simply writes to the same value.
 */
import * as React from "react";
import { MoveHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { LayoutSimulation } from "@/components/spaceplanner/LayoutSimulation";
import type { SpacePlan } from "@/lib/spaceplanner";

export function ComparisonSlider({ plan, className }: { plan: SpacePlan; className?: string }) {
  const [position, setPosition] = React.useState(52);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="relative select-none overflow-hidden rounded-xl">
          <LayoutSimulation
            space={plan.space}
            pack={plan.after}
            title="After — optimised by Spacilo AI"
            animate={false}
            showCaption={false}
          />

          <div
            className="pointer-events-none absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            aria-hidden="true"
          >
            <LayoutSimulation
              space={plan.space}
              pack={plan.before}
              title="Before — loaded in the order it arrives"
              animate={false}
              showCaption={false}
            />
          </div>

          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-signal"
            style={{ left: `calc(${position}% )` }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-signal text-signal-foreground shadow-raised">
              <MoveHorizontal className="size-4" aria-hidden="true" />
            </span>
          </div>

          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-card/90 px-2.5 py-1 type-badge backdrop-blur">
            Before
          </span>
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-card/90 px-2.5 py-1 type-badge backdrop-blur">
            After
          </span>
        </div>
      </div>


      <label className="mt-3 block">
        <span className="type-label">Drag to compare before and after</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="mt-2 h-11 w-full accent-[var(--color-signal)]"
          aria-label="Comparison position: 0 shows the optimised plan, 100 shows the unplanned load"
        />
      </label>

      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface p-3">
          <dt className="type-overline text-muted-foreground">Before — floor used</dt>
          <dd className="type-card-title">{plan.before.floorAreaUsed.toFixed(1)}m²</dd>
        </div>
        <div className="rounded-xl bg-success-soft p-3">
          <dt className="type-overline text-success-soft-foreground">After — floor used</dt>
          <dd className="type-card-title">{plan.after.floorAreaUsed.toFixed(1)}m²</dd>
        </div>
      </dl>
    </div>
  );
}
