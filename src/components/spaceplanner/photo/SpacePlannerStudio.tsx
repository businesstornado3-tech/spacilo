/**
 * SpacePlannerStudio — the homepage Spacilo AI SpacePlanner™ experience.
 *
 * Show us your stuff → confirm what's yours → show us your space → we show you
 * how it fits, what it's worth, and then draw it.
 *
 * Two principles drive the flow:
 *   1. The USER decides what counts. Either they mark exactly what they want
 *      to store (Mode A) or they ask for the whole photo (Mode B). Spacilo AI
 *      never decides that for them.
 *   2. Numbers first, pictures second. The analytical result — fit, capacity,
 *      earning potential — appears as soon as it exists; the arranged image
 *      renders afterwards, in the background, and never blocks anything.
 */
import * as React from "react";
import { ArrowRight, Boxes, Camera, CheckCircle2, Home, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScanUploader } from "@/components/vision/ScanUploader";
import { PhotoGallery } from "@/components/vision/PhotoGallery";
import { PhotoRegionSelector } from "@/components/vision/PhotoRegionSelector";
import { VisionAnalysis } from "@/components/vision/VisionAnalysis";

import { PhotoArrangement } from "@/components/spaceplanner/photo/PhotoArrangement";
import { SpacePlannerResult } from "@/components/spaceplanner/photo/SpacePlannerResult";
import { EarningsEstimateCard } from "@/components/spaceplanner/photo/EarningsEstimateCard";
import { useVisionAI } from "@/hooks/useVisionAI";
import { isVisualisationWorking, useSpaceVisualisation } from "@/hooks/useSpaceVisualisation";
import { useStableScroll } from "@/hooks/useStableScroll";
import { InventoryLock } from "@/components/spaceplanner/photo/InventoryLock";
import { SpacePlannerDiagnostics } from "@/components/spaceplanner/photo/SpacePlannerDiagnostics";
import { PlannerProgress } from "@/components/spaceplanner/photo/PlannerProgress";
import { ArrangementPlanDiagram } from "@/components/spaceplanner/photo/ArrangementPlanDiagram";
import { buildPhotoPlan, spaceFromScan, type SpaceSource } from "@/lib/spaceplanner/photo";
import { earningsFromPlan } from "@/lib/spaceplanner/photo/earnings";
import { usableVolume } from "@/lib/spaceplanner/spaces";
import {
  buildPlacementManifest,
  lockInventory,
  type CanonicalInventory,
} from "@/lib/spaceplanner/photo/manifest";
import { generaliseUncertain } from "@/lib/spaceplanner/photo/uncertain";
import { plannerSteps } from "@/lib/spaceplanner/photo/progress";
import { verificationStatusOf } from "@/lib/spaceplanner/photo/diagnostics";
import { track } from "@/lib/analytics/tracker";
import { clearVisualisationCache } from "@/lib/spaceplanner/photo/visualise";


type Step = "stuff" | "review" | "space" | "result";

export function SpacePlannerStudio({ onExplore }: { onExplore?: () => void }) {
  const [step, setStep] = React.useState<Step>("stuff");
  const stuff = useVisionAI({ mode: "belongings" });
  const space = useVisionAI({ mode: "space" });
  const [manual, setManual] = React.useState({ width: "", depth: "", height: "" });
  /** The confirmed inventory. One source of truth for everything downstream. */
  const [inventory, setInventory] = React.useState<CanonicalInventory | null>(null);
  /** Which photo the region selector is currently open on. */
  const [selectingStuff, setSelectingStuff] = React.useState<string | null>(null);
  const [selectingSpace, setSelectingSpace] = React.useState<string | null>(null);

  const { anchor, hold, mark, reveal } = useStableScroll(step);
  /** The "here's what you just added, here's the next action" block. */
  const stuffNextRef = React.useRef<HTMLDivElement>(null);
  const spaceNextRef = React.useRef<HTMLDivElement>(null);

  /**
   * After photos land: keep the page exactly where it was, then bring the
   * review + CTA into view. Never the top of the page.
   */
  const settleAfterUpload = React.useCallback(
    (target: React.RefObject<HTMLDivElement | null>) => {
      hold();
      window.setTimeout(() => reveal(target.current), 420);
    },
    [hold, reveal],
  );

  const manualSource = React.useMemo<SpaceSource | null>(() => {
    const width = Number(manual.width);
    const depth = Number(manual.depth);
    const height = Number(manual.height);
    if (!width || !depth || !height) return null;
    return { widthM: width, depthM: depth, heightM: height, basis: "manual", name: "Your space" };
  }, [manual]);

  const source: SpaceSource | null = space.spaceScan
    ? spaceFromScan(space.spaceScan)
    : manualSource;

  const planObjects = inventory?.objects ?? [];

  const result = React.useMemo(
    () => (source && planObjects.length > 0 ? buildPhotoPlan(planObjects, source) : null),
    [source, planObjects],
  );

  /** Earning potential follows usable capacity, never the raw room volume. */
  const earnings = React.useMemo(() => {
    if (!result) return null;
    const usable = usableVolume(result.space);
    return earningsFromPlan({
      usableVolumeM3: usable,
      usableAreaM2: result.space.width * result.space.depth,
      occupiedVolumeM3: result.spaceUsedM3,
      spaceType: "storage-room",
    });
  }, [result]);

  const manifest = React.useMemo(
    () =>
      inventory && result
        ? buildPlacementManifest(
            inventory,
            result,
            (space.spaceScan?.features ?? []).map((feature) => ({ ...feature, verified: true })),
          )
        : null,
    [inventory, result, space.spaceScan],
  );

  const spacePhoto = space.photos[0] ?? null;
  const visual = useSpaceVisualisation({
    result,
    objects: planObjects,
    manifest,
    spacePhoto,
    itemPhotos: stuff.photos,
  });

  /** Ten real pipeline stages, derived from state that genuinely exists. */
  const steps = React.useMemo(
    () =>
      plannerSteps({
        itemPhotos: stuff.photos.length,
        detectedUnits: stuff.objects.reduce((sum, object) => sum + object.quantity, 0),
        sized: Boolean(inventory && inventory.items.length > 0),
        spaceSupplied: space.photos.length > 0 || Boolean(manualSource),
        roomReady: Boolean(source),
        inventoryLocked: Boolean(inventory),
        planReady: Boolean(manifest),
        constraintsClear: Boolean(result && result.arrangement.violations.length === 0),
        render: isVisualisationWorking(visual.status)
          ? "working"
          : visual.status === "verified"
            ? "ready"
            : visual.status === "idle"
              ? "idle"
              : "failed",

        verification: verificationStatusOf(visual.coverage),
      }),
    [
      stuff.photos.length,
      stuff.objects,
      inventory,
      space.photos.length,
      manualSource,
      source,
      manifest,
      result,
      visual.status,
      visual.coverage,
    ],
  );



  React.useEffect(() => {
    if (result) {
      track("spaceplanner_fit_calculated", {
        props: { fit: result.fitPercent, items: result.itemCount },
      });
    }
  }, [result]);

  // The visual arrangement is deliberately asynchronous: the numbers above are
  // already on screen by the time this starts. One attempt per confirmed
  // inventory + space; retry is explicit.
  const attempted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (step !== "result" || !inventory || !manifest || !result || !spacePhoto) return;
    const signature = `${spacePhoto.id}:${manifest.planHash}`;
    if (attempted.current === signature) return;
    attempted.current = signature;
    void visual.generate();
  }, [step, result, spacePhoto, inventory, manifest, visual]);

  const analyseStuff = async () => {
    track("spaceplanner_analysis_started", {
      props: { mode: "belongings", scope: stuff.scope, photos: stuff.photos.length },
    });
    const startedAt = Date.now();
    await stuff.analyse();
    hold();
    track("spaceplanner_items_detected", {
      props: { count: stuff.photos.length, ms: Date.now() - startedAt },
    });
    setInventory(null);
    setStep("review");
  };

  const confirmInventory = () => {
    const locked = lockInventory(generaliseUncertain(stuff.objects));
    setInventory(locked);
    track("spaceplanner_items_detected", {
      props: { count: locked.distinctItems, units: locked.itemCount, confirmed: 1 },
    });
    setStep("space");
  };

  const analyseSpace = async () => {
    track("spaceplanner_analysis_started", { props: { mode: "space" } });
    await space.analyse();
    hold();
    track("spaceplanner_space_detected", { props: { photos: space.photos.length } });
    setStep("result");
  };

  const restart = () => {
    stuff.reset();
    space.reset();
    setInventory(null);
    setManual({ width: "", depth: "", height: "" });
    clearVisualisationCache();
    setStep("stuff");
  };

  const stuffPhotoBeingSelected = stuff.photos.find((photo) => photo.id === selectingStuff) ?? null;
  const spacePhotoBeingSelected = space.photos.find((photo) => photo.id === selectingSpace) ?? null;

  return (
    <div className="space-y-5">
      <div ref={anchor} className="scroll-mt-24" />
      <nav aria-label="SpacePlanner steps" className="flex flex-wrap gap-2">
        {(
          [
            ["stuff", "1. Your stuff", Boxes],
            ["review", "2. Confirm items", CheckCircle2],
            ["space", "3. Your space", Home],
            ["result", "4. How it fits", Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "stuff" || (id === "review" && stuff.objects.length > 0)) setStep(id);
              else if (id === "space" && inventory) setStep(id);
              else if (id === "result" && inventory && source) setStep(id);
            }}
            disabled={
              (id === "review" && stuff.objects.length === 0) ||
              (id === "space" && !inventory) ||
              (id === "result" && (!inventory || !source))
            }
            aria-current={step === id ? "step" : undefined}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 type-badge " +
               (step === id ? "bg-signal text-signal-foreground" : "bg-surface text-muted-foreground") +
               " disabled:cursor-not-allowed disabled:opacity-45"
            }
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {step === "stuff" ? (
        <div className="space-y-4" aria-live="polite">
          {stuff.status === "analysing" ? (
            <VisionAnalysis
              stages={stuff.stages}
              stageIndex={stuff.stageIndex}
              title="Spacilo AI is scanning your belongings"
            />
          ) : (
            <>
              <fieldset className="rounded-2xl border border-border bg-surface p-4">
                <legend className="px-1 type-label">What should Spacilo AI look at?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["selected", "Only what I select"],
                      ["whole", "Everything in the photo"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={stuff.scope === value}
                      onClick={() => stuff.setScope(value)}
                      className={
                        "rounded-full px-3 py-1.5 type-badge transition-colors " +
                        (stuff.scope === value
                          ? "bg-signal text-signal-foreground"
                          : "bg-card text-muted-foreground")
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 type-body-xs text-muted-foreground">
                  {stuff.scope === "selected"
                    ? "Draw round each item you want to store. Anything you don't select is ignored."
                    : "Spacilo AI will list everything it can see, including things around your belongings."}
                </p>
              </fieldset>

              <ScanUploader
                onInteract={mark}
                onFiles={(files) => {
                  track("spaceplanner_image_uploaded", { props: { mode: "belongings" } });
                  stuff.addFiles(files);
                  settleAfterUpload(stuffNextRef);
                }}
                rejected={stuff.rejected}
                disabled={!stuff.canAddMore}
                title="Show Spacilo AI your belongings"
                hint="Photograph the whole item where possible — one clear photo per item, or per group of similar items."
              />

              {stuffPhotoBeingSelected ? (
                <PhotoRegionSelector
                  photoId={stuffPhotoBeingSelected.id}
                  photoUrl={stuffPhotoBeingSelected.url}
                  rotation={stuffPhotoBeingSelected.rotation}
                  selection={
                    stuff.selections.find(
                      (entry) => entry.photoId === stuffPhotoBeingSelected.id,
                    ) ?? null
                  }
                  onChange={(selection) => {
                    stuff.setSelection(selection, stuffPhotoBeingSelected.id);
                    if (selection) setSelectingStuff(null);
                  }}
                />
              ) : null}

              <div ref={stuffNextRef} className="scroll-mt-24 space-y-4">
                <PhotoGallery
                  photos={stuff.photos}
                  onRemove={stuff.removePhoto}
                  onRotate={stuff.rotatePhoto}
                  onMove={stuff.movePhoto}
                  onReplace={stuff.replacePhoto}
                  {...(stuff.scope === "selected"
                    ? { onSelectRegion: (id: string) => setSelectingStuff(id) }
                    : {})}
                  quality={stuff.quality}
                  canAddMore={stuff.canAddMore}
                />
                {stuff.photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="lg" onClick={() => void analyseStuff()}>
                      <Sparkles aria-hidden="true" />
                      {stuff.objects.length > 0 ? "Analyse again" : "Analyse my belongings"}
                    </Button>
                    {stuff.objects.length > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => setStep("review")}
                      >
                        See what Spacilo AI found
                        <ArrowRight aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-4" aria-live="polite">
          {stuff.objects.length > 0 ? (
            <InventoryLock
              objects={stuff.objects}
              actions={stuff.editor}
              onAdd={stuff.editor.add}
              onConfirm={confirmInventory}
              onRetake={() => setStep("stuff")}
            />
          ) : (
            <p className="type-body-sm text-muted-foreground">
              Add photos of your belongings and run Spacilo AI to build your inventory.
            </p>
          )}
        </div>
      ) : null}


      {step === "space" ? (
        <div className="space-y-4" aria-live="polite">
          {space.status === "analysing" ? (
            <VisionAnalysis
              stages={space.stages}
              stageIndex={space.stageIndex}
              title="Spacilo AI is analysing your space"
            />
          ) : (
            <>
              <ScanUploader
                onInteract={mark}
                onFiles={(files) => {
                  track("spaceplanner_image_uploaded", { props: { mode: "space" } });
                  space.addFiles(files);
                  settleAfterUpload(spaceNextRef);
                }}
                rejected={space.rejected}
                disabled={!space.canAddMore}
                title="Now show us the space"
                hint="Capture the full space from a corner or doorway. Keep walls, floor and access points visible."
              />

              {spacePhotoBeingSelected ? (
                <PhotoRegionSelector
                  photoId={spacePhotoBeingSelected.id}
                  photoUrl={spacePhotoBeingSelected.url}
                  rotation={spacePhotoBeingSelected.rotation}
                  selection={
                    space.selections.find(
                      (entry) => entry.photoId === spacePhotoBeingSelected.id,
                    ) ?? null
                  }
                  title="Mark the area you'd actually use for storage"
                  hint="Draw round the usable area only — leave out walkways, doorways, boilers and anything fixed in place."
                  wholeLabel="Use the whole space"
                  onChange={(selection) => {
                    space.setSelection(selection, spacePhotoBeingSelected.id);
                    if (selection) setSelectingSpace(null);
                  }}
                />
              ) : null}

              <div ref={spaceNextRef} className="scroll-mt-24 space-y-4">
                <PhotoGallery
                  photos={space.photos}
                  onRemove={space.removePhoto}
                  onRotate={space.rotatePhoto}
                  onMove={space.movePhoto}
                  onReplace={space.replacePhoto}
                  onSelectRegion={(id) => setSelectingSpace(id)}
                  quality={space.quality}
                  canAddMore={space.canAddMore}
                />
                {space.photos.length > 0 ? (
                  <Button type="button" size="lg" onClick={() => void analyseSpace()}>
                    <Camera aria-hidden="true" />
                    Analyse this space
                  </Button>
                ) : null}
              </div>

              <fieldset className="rounded-2xl border border-border p-4">
                <legend className="px-1 type-label">Or enter the dimensions (metres)</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["width", "depth", "height"] as const).map((field) => (
                    <label key={field} className="block">
                      <span className="type-body-xs capitalize text-muted-foreground">{field}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.1"
                        value={manual[field]}
                        onChange={(event) =>
                          setManual((current) => ({ ...current, [field]: event.target.value }))
                        }
                        className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 type-body-sm"
                      />
                    </label>
                  ))}
                </div>
                {manualSource ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setStep("result")}
                  >
                    Use these dimensions
                  </Button>
                ) : null}
              </fieldset>
            </>
          )}
        </div>
      ) : null}

      {step === "result" ? (
        <div className="space-y-4">
          {result ? (
            <>
              <PlannerProgress
                steps={steps}
                elapsedMs={visual.elapsedMs}
                planReady={Boolean(manifest)}
              />
              <SpacePlannerResult result={result}>

                {spacePhoto ? (
                  <PhotoArrangement
                    photoUrl={spacePhoto.url}
                    space={result.space}
                    pack={result.plan.after}
                    arrangedUrl={visual.imageUrl}
                    status={visual.status}
                    statusLabel={
                      visual.status === "working"
                        ? `${visual.stageLabel}${visual.attempt > 1 ? " (refining)" : ""} · ${Math.round(visual.elapsedMs / 1000)}s`
                        : visual.stageLabel
                    }
                    coverage={visual.coverage}
                    errorCode={visual.error}
                    onRetry={() => void visual.generate()}

                    description={`${result.itemCount} items shown in the space you photographed. Estimated fit ${result.fitPercent}%, with about ${result.spaceRemainingM3.toFixed(1)}m³ estimated to remain.`}
                  />
                ) : (
                  <p className="type-body-sm text-muted-foreground">
                    Add a photo of the space to see your belongings arranged inside it.
                  </p>
                )}
              </SpacePlannerResult>

              {manifest ? (
                visual.status === "failed" || visual.status === "rejected" ? (
                  <section className="rounded-2xl border border-border bg-surface p-4">
                    <h4 className="type-h4">Your arrangement plan is ready</h4>
                    <p className="mt-1 type-body-sm text-muted-foreground">
                      The photographic preview didn&apos;t come out accurately this time, so
                      we&apos;re showing the plan itself — the same positions the planner decided,
                      drawn to scale.
                    </p>
                    <ArrangementPlanDiagram manifest={manifest} className="mt-3" />
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => void visual.generate()}
                    >
                      <RefreshCw aria-hidden="true" />
                      Try the visual preview again
                    </Button>
                  </section>
                ) : (
                  <details className="rounded-2xl border border-border bg-surface p-4">
                    <summary className="cursor-pointer type-label text-foreground">
                      View arrangement plan
                    </summary>
                    <p className="mt-2 type-body-sm text-muted-foreground">
                      Exactly where the planner decided each item goes — the same plan the visual
                      preview renders.
                    </p>
                    <ArrangementPlanDiagram manifest={manifest} className="mt-3" />
                  </details>
                )
              ) : null}

              {earnings ? <EarningsEstimateCard earnings={earnings} /> : null}


              <div className="flex flex-wrap gap-2">
                {onExplore ? (
                  <Button type="button" size="lg" onClick={onExplore}>
                    Explore in SpacePlanner
                    <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="lg" onClick={restart}>
                  <RefreshCw aria-hidden="true" />
                  Start again
                </Button>
              </div>
            </>
          ) : (
            <p className="type-body-sm text-muted-foreground">
              Scan your belongings and a space, and Spacilo AI will show you how they fit.
            </p>
          )}
        </div>
      ) : null}

      <SpacePlannerDiagnostics
        photoCount={stuff.photos.length + space.photos.length}
        detectedCount={stuff.objects.reduce((sum, object) => sum + object.quantity, 0)}
        inventory={inventory}
        roomReady={Boolean(source)}
        manifest={manifest}
        visualStatus={visual.status}
        coverage={visual.coverage}
        render={visual.diagnostics}
      />
    </div>
  );
}

export default SpacePlannerStudio;
