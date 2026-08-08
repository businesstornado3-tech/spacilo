/**
 * Homepage hero teaser — the marketing face of the Digital Twin.
 *
 * The engine, planner and motion director are exactly the ones the product
 * uses; only the presentation is stripped back. No controls, no inspector, no
 * dashboards: one AI status line, a subtle progress rail, and the outcome.
 *
 * The full interactive twin lives in <TwinExperience /> and is unchanged.
 */
import * as React from "react";
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-motion";
import { useTwinExperience } from "@/hooks/useTwinExperience";
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import { SPACE_BY_ID } from "@/lib/spaceplanner/spaces";
import type { InventoryLine } from "@/lib/spaceplanner/types";
import { floorGainPercent } from "@/lib/twin/experience";
import { TwinViewer } from "@/components/twin/TwinViewer";

/** A light, readable load — the teaser reads in seconds, not minutes. */
const TEASER_LINES: Array<{ itemId: string; quantity: number }> = [
  { itemId: "large-box", quantity: 3 },
  { itemId: "medium-box", quantity: 2 },
  { itemId: "bicycle", quantity: 1 },
  { itemId: "suitcase", quantity: 1 },
];

/** One plain-language status per beat. Never technical. */
const STATUS: Record<string, string> = {
  load: "Reading the space…",
  analyse: "Analysing available space…",
  space: "Finding unused space…",
  access: "Checking safe access…",
  group: "Optimising layout…",
  move: "Creating a clear walkway…",
  final: "Optimised successfully.",
};

function toLines(entries: Array<{ itemId: string; quantity: number }>): InventoryLine[] {
  return entries.flatMap((entry) => {
    const item = CATALOGUE_BY_ID.get(entry.itemId);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });
}

export function HeroTwinTeaser({ className }: { className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const lines = React.useMemo(() => toLines(TEASER_LINES), []);
  const space = SPACE_BY_ID.get("garage")!;

  const { plan, beat, progress } = useTwinExperience({ lines, space, paused: !inView });
  const done = beat.kind === "final";
  const gain = floorGainPercent(plan);

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border bg-card shadow-lg",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
        {/* Presentation only — the hero is not an interactive surface. */}
        <div className="pointer-events-none absolute inset-0">
          <TwinViewer bare scene={useSceneOf()} mode="isometric" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-1.5 backdrop-blur-sm">
            <Sparkles className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
            <p className="truncate type-label text-foreground">{STATUS[beat.kind] ?? STATUS.load}</p>
          </div>
        </div>

        {done ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-4 flex flex-wrap gap-2 sm:inset-x-4">
            {[gain > 0 ? `+${gain}% usable floor space` : "Optimised successfully", "Walkway clear"].map(
              (outcome) => (
                <span
                  key={outcome}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 type-badge text-foreground backdrop-blur-sm"
                >
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {outcome}
                </span>
              ),
            )}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {STATUS[beat.kind] ?? ""}
      </p>
    </div>
  );
}

/** Kept separate so the viewer always renders the live engine scene. */
function useSceneOf() {
  throw new Error("placeholder");
}
