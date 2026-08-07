/**
 * Phase 6 Part 2 — the signature Spacilo experience.
 *
 * A real Digital Twin, narrated by the planner's own reasoning: the room is
 * seen, the belongings are read, the unused space and the access route are
 * checked, then every object moves for a stated reason and the score climbs
 * with it. Nothing here is scripted — remove a step from the plan and the
 * story loses that beat.
 *
 * It pauses on hover and on keyboard focus, replays on its own, shows only the
 * finished layout under reduced motion, and degrades to a 2D plan without WebGL.
 */
import * as React from "react";
import { Play, Plus, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/use-motion";
import { useTwinExperience } from "@/hooks/useTwinExperience";
import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import { SPACE_BY_ID } from "@/lib/spaceplanner/spaces";
import type { InventoryLine, StorageSpace } from "@/lib/spaceplanner/types";
import { TwinViewer } from "@/components/twin/TwinViewer";

/** The load a real UK garage arrives with. Everything else is derived. */
const DEFAULT_LINES: Array<{ itemId: string; quantity: number }> = [
  { itemId: "large-box", quantity: 6 },
  { itemId: "medium-box", quantity: 4 },
  { itemId: "bicycle", quantity: 1 },
  { itemId: "mattress", quantity: 1 },
  { itemId: "television", quantity: 1 },
  { itemId: "suitcase", quantity: 2 },
];

/** Milestone 7 — what a visitor can throw at the plan, live. */
const WHAT_IF = [
  { itemId: "bicycle", label: "Bike" },
  { itemId: "large-box", label: "Box" },
  { itemId: "suitcase", label: "Suitcase" },
  { itemId: "wardrobe", label: "Wardrobe" },
  { itemId: "mattress", label: "Mattress" },
  { itemId: "television", label: "TV" },
];

function toLines(entries: Array<{ itemId: string; quantity: number }>): InventoryLine[] {
  return entries
    .map((entry) => {
      const item = CATALOGUE_BY_ID.get(entry.itemId);
      return item ? { item, quantity: entry.quantity } : null;
    })
    .filter((line): line is InventoryLine => line !== null);
}

export interface TwinExperienceProps {
  space?: StorageSpace;
  className?: string;
  /** Hide the what-if controls where the surface owns its own inventory. */
  allowWhatIf?: boolean;
}

export function TwinExperience({
  space = SPACE_BY_ID.get("garage")!,
  className,
  allowWhatIf = true,
}: TwinExperienceProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [entries, setEntries] = React.useState(DEFAULT_LINES);
  const [held, setHeld] = React.useState(false);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const lines = React.useMemo(() => toLines(entries), [entries]);
  const { plan, state, beat, progress, metrics, restart, showFinal, showOriginal } =
    useTwinExperience({ lines, space, paused: held || !inView });

  const focusId = hovered ?? selected;
  const focusObject = focusId
    ? (state.scene.objects.find((object) => object.id === focusId) ?? null)
    : null;
  const focusStep = focusObject
    ? (state.motion.steps.find((step) => step.objectId === focusObject.id) ?? null)
    : null;

  const highlightIds = focusId ? [] : beat.highlightIds;

  const addItem = (itemId: string) => {
    setEntries((current) => {
      const existing = current.find((entry) => entry.itemId === itemId);
      return existing
        ? current.map((entry) =>
            entry.itemId === itemId ? { ...entry, quantity: entry.quantity + 1 } : entry,
          )
        : [...current, { itemId, quantity: 1 }];
    });
  };

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border bg-card shadow-lg",
        className,
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => {
        setHeld(false);
        setHovered(null);
      }}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      {/* Scene */}
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
        <TwinViewer
          bare
          scene={state.scene}
          mode="isometric"
          highlightId={focusId}
          highlightIds={highlightIds}
          onHover={setHovered}
          onSelect={(id) => setSelected((current) => (current === id ? null : id))}
        />

        {/* Narration — Milestone 2 + 10 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
          <div className="inline-flex max-w-full items-start gap-2 rounded-2xl border border-border/70 bg-background/85 px-3 py-2 backdrop-blur-sm transition-opacity duration-300">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
            <div className="min-w-0">
              <p className="type-label text-foreground">{beat.caption}</p>
              {beat.detail ? (
                <p className="mt-0.5 line-clamp-2 type-badge text-muted-foreground">{beat.detail}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Object card — Milestone 5. Floating, never a modal. */}
        {focusObject ? (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[17rem] rounded-2xl border border-border bg-background/92 p-3 shadow-md backdrop-blur-sm">
            <p className="type-label text-foreground">{focusObject.label}</p>
            <p className="mt-0.5 type-badge text-muted-foreground">
              Estimated {focusObject.size.widthM.toFixed(2)}m × {focusObject.size.depthM.toFixed(2)}m ·{" "}
              {focusObject.weight} weight
            </p>
            {focusStep ? (
              <p className="mt-1.5 type-badge text-foreground">{focusStep.reason}</p>
            ) : (
              <p className="mt-1.5 type-badge text-muted-foreground">
                Left where it already sits — the plan found no better position.
              </p>
            )}
            <p className="mt-1.5 type-badge text-muted-foreground">
              Confidence {Math.round((focusStep?.confidence ?? 0.8) * 100)}% · estimate, not a guarantee
            </p>
          </div>
        ) : null}

        {/* Progress rail */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Live AI score — Milestone 6 */}
      <div className="grid grid-cols-3 gap-px border-t border-border bg-border/60 sm:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.key} className="bg-card px-2 py-2.5 text-center" title={metric.hint}>
            <p className="type-h3 tabular-nums text-foreground">
              {metric.value}
              {metric.suffix}
            </p>
            <p className="mt-0.5 truncate type-badge text-muted-foreground">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Controls — Milestones 7 + 11 + 12 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
        <Button type="button" size="sm" variant="ghost" onClick={restart}>
          <Play className="size-4" aria-hidden="true" />
          Replay
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={showOriginal}>
          Before
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={showFinal}>
          After
        </Button>

        {allowWhatIf ? (
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="type-badge text-muted-foreground">Add:</span>
            {WHAT_IF.map((option) => (
              <button
                key={option.itemId}
                type="button"
                onClick={() => addItem(option.itemId)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-2.5 type-badge text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Plus className="size-3" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Screen-reader narrative — Milestone 15 */}
      <p className="sr-only" aria-live="polite">
        {beat.caption} {beat.detail ?? ""} Estimated fit {plan.metrics.compatibility}%.
      </p>
    </div>
  );
}
