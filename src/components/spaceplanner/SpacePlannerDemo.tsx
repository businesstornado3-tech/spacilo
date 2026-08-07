/**
 * Spacilo AI SpacePlanner™ — the interactive homepage demonstration.
 *
 * This is the visitor-mode surface of the shared planner: the same provider,
 * panels and canvas the renter dashboard and host review panel use, with a
 * capability set that caps the inventory and withholds saving, photos and
 * comparison. The plan itself is produced by the deterministic engine in
 * `@/lib/spaceplanner` — no network call, no model, no camera and no account.
 */
import * as React from "react";
import { Boxes, RotateCcw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SpacePlannerProvider,
  useSpacePlanner,
} from "@/components/spaceplanner/SpacePlannerProvider";
import { InventoryPanel } from "@/components/spaceplanner/InventoryPanel";
import { StoragePanel } from "@/components/spaceplanner/StoragePanel";
import { AIProgressPanel } from "@/components/spaceplanner/AIProgressPanel";
import { PlannerCanvas } from "@/components/spaceplanner/PlannerCanvas";
import { PlannerToolbar } from "@/components/spaceplanner/PlannerToolbar";
import { RecommendationPanel } from "@/components/spaceplanner/RecommendationPanel";
import { FitScore } from "@/components/spaceplanner/FitScore";
import { UnlockCard } from "@/components/spaceplanner/UnlockCard";
import { ObjectIllustration } from "@/components/spaceplanner/ObjectArt";
import { ComparisonSlider } from "@/components/spaceplanner/ComparisonSlider";
import { AISummary } from "@/components/spaceplanner/AISummary";
import { DEMO_ANCHOR_ID, onStartDemo } from "@/components/spaceplanner/demo-bus";
import { track } from "@/lib/analytics/tracker";
import { CATALOGUE_BY_ID, GARAGE_STORY, INVENTORY_PRESETS, SPACE_BY_ID } from "@/lib/spaceplanner";

const DEFAULT_SPACE = SPACE_BY_ID.get("garage")!;
const DEFAULT_PRESET = INVENTORY_PRESETS[0]!;

export function SpacePlannerDemo() {
  return (
    <SpacePlannerProvider mode="visitor" initialSpace={DEFAULT_SPACE}>
      <DemoBody />
    </SpacePlannerProvider>
  );
}

function DemoBody() {
  const {
    phase,
    plan,
    score,
    space,
    itemCount,
    rawVolume,
    hasCompletedRun,
    loadPreset,
    addOne,
    setPhase,
  } = useSpacePlanner();
  const [view, setView] = React.useState<"plan" | "compare">("plan");
  const resultsRef = React.useRef<HTMLDivElement>(null);

  // "Try SpacePlanner™" in the hero starts a real run, loading a preset first
  // if the visitor has not chosen anything yet.
  React.useEffect(
    () =>
      onStartDemo(() => {
        if (itemCount === 0) loadPreset(DEFAULT_PRESET.lines);
        setView("plan");
        setPhase("thinking");
      }),
    [itemCount, loadPreset, setPhase],
  );

  const onRun = React.useCallback(() => {
    setView("plan");
    track("spaceplanner_demo_started", {
      props: { space: space.kind, items: itemCount, from: "homepage_planner" },
    });
  }, [space.kind, itemCount]);

  const onComplete = React.useCallback(() => {
    track("spaceplanner_demo_completed", {
      props: { space: space.kind, utilisation: plan?.metrics.utilisation ?? 0 },
    });
    window.setTimeout(() => resultsRef.current?.focus({ preventScroll: true }), 60);
  }, [space.kind, plan?.metrics.utilisation]);

  const onAdd = React.useCallback(
    (itemId: string) => {
      addOne(itemId);
      track("spaceplanner_demo_object_added", { props: { item: itemId } });
    },
    [addOne],
  );

  return (
    <section
      id={DEMO_ANCHOR_ID}
      aria-labelledby="spaceplanner-heading"
      className="scroll-mt-20 py-6 sm:py-8"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 id="spaceplanner-heading" className="type-h2">
            See it fit, before you book.
          </h2>
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-badge text-signal-soft-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Live demonstration
          </span>
        </header>

        <div className="mt-3 grid gap-3">
          <div className="order-2 grid min-w-0 items-stretch gap-3 sm:grid-cols-2">
            <div className="h-full min-w-0 rounded-2xl border border-border bg-card p-3 shadow-card">
              <h3 className="type-h4">What are you storing?</h3>
              <div className="mt-2">
                <InventoryPanel />
              </div>
            </div>

            <div className="h-full min-w-0 rounded-2xl border border-border bg-card p-3 shadow-card">
              <h3 className="type-h4">Where might it go?</h3>
              <div className="mt-2">
                <StoragePanel />
              </div>
            </div>
          </div>

          <div className="order-1 min-w-0">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <h3 className="type-h4">Your estimated plan</h3>
                  <p className="mt-1 truncate type-body-sm text-muted-foreground">
                    {itemCount === 0
                      ? "Choose belongings to begin."
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
                      <PlannerCanvas view="before" />
                    ) : (
                      <EmptyState onPreset={() => loadPreset(DEFAULT_PRESET.lines)} />
                    )}
                    <div className="mt-4">
                      <PlannerToolbar onRun={onRun} />
                    </div>
                  </div>
                ) : null}

                {phase === "thinking" ? <AIProgressPanel onComplete={onComplete} /> : null}

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
                        <PlannerCanvas view="after" />
                        <AddTray onAdd={onAdd} />
                      </>
                    ) : (
                      <ComparisonSlider plan={plan} />
                    )}

                    {score ? (
                      <div className="mt-4 rounded-2xl border border-border bg-surface/60 p-4">
                        <FitScore score={score} />
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <AISummary plan={plan} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {phase === "plan" && plan ? (
              <div className="mt-4 grid gap-4">
                <RecommendationPanel />
                {hasCompletedRun ? <UnlockCard /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
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
        active
          ? "bg-card text-foreground shadow-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ onPreset }: { onPreset: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-strong bg-surface p-5 text-center">
      <Boxes className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 type-label">Nothing to plan yet</p>
      <p className="mt-1 max-w-xs type-body-sm text-muted-foreground">
        Choose belongings alongside, or load a typical inventory.
      </p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onPreset}>
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
