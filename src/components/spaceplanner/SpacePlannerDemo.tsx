/**
 * Spacilo AI SpacePlanner™ — the interactive homepage demonstration.
 *
 * Three steps: choose belongings, choose a space, watch the planner work. The
 * plan is produced by the deterministic engine in `@/lib/spaceplanner` — no
 * network call, no model, no camera and no account. What a visitor sees here
 * is exactly what the engine computes, so the demo can be trusted as a
 * preview of the real product rather than a scripted mock-up.
 */
import * as React from "react";
import { ArrowRight, Boxes, RotateCcw, Sparkles, Warehouse } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScanStuffButton } from "@/components/home/SpaceFitEntry";
import { InventoryBuilder } from "@/components/spaceplanner/InventoryBuilder";
import { StorageSelector } from "@/components/spaceplanner/StorageSelector";
import { AIThinkingTimeline } from "@/components/spaceplanner/AIThinkingTimeline";
import { LayoutSimulation } from "@/components/spaceplanner/LayoutSimulation";
import { PlanScene } from "@/components/spaceplanner/PlanScene";
import { ObjectIllustration } from "@/components/spaceplanner/ObjectArt";
import { ComparisonSlider } from "@/components/spaceplanner/ComparisonSlider";
import { AIExplanation, AISummary } from "@/components/spaceplanner/AISummary";
import { DEMO_ANCHOR_ID, onStartDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";
import {
  CATALOGUE_BY_ID,
  GARAGE_STORY,
  INVENTORY_PRESETS,
  SPACE_BY_ID,
  itemVolume,
  simulationEngine,
  type InventoryLine,
  type StorageSpace,
} from "@/lib/spaceplanner";

type Phase = "build" | "thinking" | "plan";

const DEFAULT_SPACE = SPACE_BY_ID.get("garage")!;
const DEFAULT_PRESET = INVENTORY_PRESETS[0]!;

export function SpacePlannerDemo() {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [space, setSpace] = React.useState<StorageSpace>(DEFAULT_SPACE);
  const [phase, setPhase] = React.useState<Phase>("build");
  const [view, setView] = React.useState<"plan" | "compare">("plan");
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const lines: InventoryLine[] = React.useMemo(
    () =>
      Object.entries(quantities)
        .map(([itemId, quantity]) => ({ item: CATALOGUE_BY_ID.get(itemId)!, quantity }))
        .filter((line) => line.item && line.quantity > 0),
    [quantities],
  );

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const rawVolume = lines.reduce((sum, line) => sum + itemVolume(line.item) * line.quantity, 0);
  const plan = React.useMemo(
    () => (itemCount > 0 ? simulationEngine.plan(lines, space) : null),
    [lines, space, itemCount],
  );

  const loadPreset = React.useCallback(
    (presetLines: Array<{ itemId: string; quantity: number }>) => {
      setQuantities(Object.fromEntries(presetLines.map((l) => [l.itemId, l.quantity])));
      setPhase("build");
    },
    [],
  );

  const run = React.useCallback(() => {
    setPhase("thinking");
    setView("plan");
    track("spaceplanner_demo_started", {
      props: { space: space.kind, items: itemCount, from: "homepage_planner" },
    });
  }, [space.kind, itemCount]);

  // "Try SpacePlanner™" in the hero starts a real run, loading a preset first
  // if the visitor has not chosen anything yet.
  React.useEffect(
    () =>
      onStartDemo(() => {
        setQuantities((current) => {
          const empty = Object.values(current).every((q) => !q);
          if (!empty) return current;
          return Object.fromEntries(DEFAULT_PRESET.lines.map((l) => [l.itemId, l.quantity]));
        });
        setView("plan");
        setPhase("thinking");
      }),
    [],
  );

  /** Micro-interaction: drop or tap one more object and the plan recalculates. */
  const addOne = React.useCallback((itemId: string) => {
    setQuantities((current) => ({ ...current, [itemId]: (current[itemId] ?? 0) + 1 }));
    track("spaceplanner_demo_object_added", { props: { item: itemId } });
  }, []);

  const onThinkingComplete = React.useCallback(() => {
    setPhase("plan");
    track("spaceplanner_demo_completed", {
      props: { space: space.kind, utilisation: plan?.metrics.utilisation ?? 0 },
    });
    window.setTimeout(() => resultsRef.current?.focus({ preventScroll: true }), 60);
  }, [space.kind, plan?.metrics.utilisation]);

  return (
    <section
      id={DEMO_ANCHOR_ID}
      aria-labelledby="spaceplanner-heading"
      className="scroll-mt-20 border-y border-border/70 bg-surface/60 py-12 sm:py-16"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Live demonstration
          </span>
          <h2 id="spaceplanner-heading" className="mt-3 type-h1">
            Plan a real space in three steps.
          </h2>
        </header>

        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Demonstration steps">
          <StepChip index={1} label="Choose your belongings" icon={Boxes} done={itemCount > 0} />
          <StepChip index={2} label="Pick a storage space" icon={Warehouse} done={itemCount > 0} />
          <StepChip index={3} label="Watch it organise" icon={Sparkles} done={phase === "plan"} />
        </ol>


        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:items-start">
          <div className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h3 className="type-h4">1. What are you storing?</h3>
            <div className="mt-4">
              <InventoryBuilder
                quantities={quantities}
                onChange={(itemId, quantity) =>
                  setQuantities((current) => ({ ...current, [itemId]: quantity }))
                }
                onPreset={(presetLines) => loadPreset(presetLines)}
                onClear={() => {
                  setQuantities({});
                  setPhase("build");
                }}
              />
            </div>

            <h3 className="mt-8 type-h4">2. Where might it go?</h3>
            <div className="mt-4">
              <StorageSelector selectedId={space.id} onSelect={setSpace} />
            </div>
          </div>

          <div className="min-w-0 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <h3 className="type-h4">3. Your estimated plan</h3>
                  <p className="mt-1 truncate type-body-sm text-muted-foreground">
                    {itemCount === 0
                      ? "Add a few belongings to begin."
                      : `${itemCount} item${itemCount === 1 ? "" : "s"} · ~${rawVolume.toFixed(1)}m³ · ${space.name}`}
                  </p>
                </div>
                {phase === "plan" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setPhase("build")}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Adjust
                  </Button>
                ) : null}
              </div>

              <div className="mt-4">
                {phase === "build" ? (
                  <div>
                    {plan ? (
                      <LayoutSimulation
                        space={space}
                        pack={plan.before}
                        animate={false}
                        showLabels={false}
                        title="Unplanned — everything loaded as it arrives"
                      />
                    ) : (
                      <EmptyState onPreset={() => loadPreset(DEFAULT_PRESET.lines)} />
                    )}
                    <Button
                      block
                      size="lg"
                      className="mt-4"
                      disabled={itemCount === 0}
                      onClick={run}
                    >
                      Plan my space with Spacilo AI
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}

                {phase === "thinking" ? <AIThinkingTimeline onComplete={onThinkingComplete} /> : null}

                {phase === "plan" && plan ? (
                  <div ref={resultsRef} tabIndex={-1} className="outline-none">
                    <div
                      role="tablist"
                      aria-label="Plan view"
                      className="mb-3 inline-flex rounded-full bg-surface p-1"
                    >
                      <ViewTab active={view === "plan"} onClick={() => setView("plan")}>
                        Optimised plan
                      </ViewTab>
                      <ViewTab active={view === "compare"} onClick={() => setView("compare")}>
                        Before / after
                      </ViewTab>
                    </div>

                    {view === "plan" ? (
                      <>
                        <PlanScene
                          space={space}
                          pack={plan.after}
                          explain
                          onAdd={addOne}
                          label={`Optimised plan view of the ${space.name.toLowerCase()}`}
                        />
                        <AddTray onAdd={addOne} />
                      </>
                    ) : (
                      <ComparisonSlider plan={plan} />
                    )}

                    <div className="mt-4">
                      <AISummary plan={plan} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {phase === "plan" && plan ? (
              <>
                <div className="mt-4">
                  <AIExplanation plan={plan} />
                </div>
                <div className="mt-4 rounded-3xl border border-primary/30 bg-primary-soft/40 p-4 sm:p-5">
                  <p className="type-card-title">Ready to see your own storage plan?</p>
                  <p className="mt-1 type-body-sm text-muted-foreground">
                    Spacilo AI works from your own photos, then matches spaces nearby.
                  </p>

                  <div className="mt-4">
                    <ScanStuffButton from="homepage_planner_result">
                      Try it on my own things
                    </ScanStuffButton>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepChip({
  index,
  label,
  icon: Icon,
  done,
}: {
  index: number;
  label: string;
  icon: typeof Boxes;
  done: boolean;
}) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 type-badge transition-colors",
        done ? "border-signal/50 bg-signal-soft/50 text-signal-soft-foreground" : "border-border bg-card text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{index}.</span> {label}
    </li>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full px-3.5 type-label transition-colors",
        active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ onPreset }: { onPreset: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <Boxes className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 type-label">Nothing to plan yet</p>
      <p className="mt-1 max-w-xs type-body-sm text-muted-foreground">
        Add belongings on the left, or load a typical inventory to see how the planner works.
      </p>
      <Button variant="secondary" className="mt-4" onClick={onPreset}>
        Load the “{DEFAULT_PRESET.name}” example
      </Button>
    </div>
  );
}

/** Extra belongings a visitor can drag (or tap) into the finished plan. */
function AddTray({ onAdd }: { onAdd: (itemId: string) => void }) {
  const items = GARAGE_STORY.addable
    .map((id) => CATALOGUE_BY_ID.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border-strong bg-surface p-3">
      <p className="type-label">Add one more thing</p>
      <p className="mt-0.5 type-body-sm text-muted-foreground">
        Drag an object into the plan, or tap it — Spacilo AI replans instantly.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
              onClick={() => onAdd(item.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 type-label transition-colors hover:border-primary hover:bg-primary-soft/40"
            >
              <span className="size-6 shrink-0">
                <ObjectIllustration icon={item.icon} />
              </span>
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
