/**
 * SpacePlannerStudio — the homepage Spacilo AI SpacePlanner™ experience.
 *
 * Show us your stuff → show us your space → we show you how it fits. The
 * result is built on the user's own photograph; the Digital Twin remains the
 * deeper planning step afterwards, never a prerequisite.
 *
 * Nothing heavy runs until someone starts a scan.
 */
import * as React from "react";
import { ArrowRight, Boxes, Camera, Home, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScanUploader } from "@/components/vision/ScanUploader";
import { PhotoGallery } from "@/components/vision/PhotoGallery";
import { VisionAnalysis } from "@/components/vision/VisionAnalysis";
import { DetectedInventory } from "@/components/vision/DetectedInventory";
import { PhotoArrangement } from "@/components/spaceplanner/photo/PhotoArrangement";
import { SpacePlannerResult } from "@/components/spaceplanner/photo/SpacePlannerResult";
import { useVisionAI } from "@/hooks/useVisionAI";
import { useSpaceVisualisation } from "@/hooks/useSpaceVisualisation";
import { buildPhotoPlan, spaceFromScan, type SpaceSource } from "@/lib/spaceplanner/photo";
import { track } from "@/lib/analytics/tracker";

type Step = "stuff" | "space" | "result";

export function SpacePlannerStudio({ onExplore }: { onExplore?: () => void }) {
  const [step, setStep] = React.useState<Step>("stuff");
  const stuff = useVisionAI({ mode: "belongings" });
  const space = useVisionAI({ mode: "space" });
  const [manual, setManual] = React.useState({ width: "", depth: "", height: "" });

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

  const result = React.useMemo(
    () => (source && stuff.objects.length > 0 ? buildPhotoPlan(stuff.objects, source) : null),
    [source, stuff.objects],
  );

  const spacePhoto = space.photos[0] ?? null;
  const visual = useSpaceVisualisation({
    result,
    objects: stuff.objects,
    spacePhoto,
    itemPhotos: stuff.photos,
  });

  React.useEffect(() => {
    if (result) {
      track("spaceplanner_fit_calculated", {
        props: { fit: result.fitPercent, items: result.itemCount },
      });
    }
  }, [result]);

  // One automatic attempt per result on the results step; retry is explicit.
  const attempted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (step !== "result" || !result || !spacePhoto) return;
    const signature = `${spacePhoto.id}:${result.itemCount}:${result.fitPercent}`;
    if (attempted.current === signature) return;
    attempted.current = signature;
    void visual.generate();
  }, [step, result, spacePhoto, visual]);



  const analyseStuff = async () => {
    track("spaceplanner_analysis_started", { props: { mode: "belongings" } });
    await stuff.analyse();
    track("spaceplanner_items_detected", { props: { count: stuff.photos.length } });
    setStep("space");
  };

  const analyseSpace = async () => {
    track("spaceplanner_analysis_started", { props: { mode: "space" } });
    await space.analyse();
    track("spaceplanner_space_detected", { props: { photos: space.photos.length } });
    setStep("result");
  };

  const restart = () => {
    stuff.reset();
    space.reset();
    setManual({ width: "", depth: "", height: "" });
    setStep("stuff");
  };

  return (
    <div className="space-y-5">
      <nav aria-label="SpacePlanner steps" className="flex flex-wrap gap-2">
        {(
          [
            ["stuff", "1. Your stuff", Boxes],
            ["space", "2. Your space", Home],
            ["result", "3. How it fits", Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStep(id)}
            aria-current={step === id ? "step" : undefined}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 type-badge " +
              (step === id ? "bg-signal text-signal-foreground" : "bg-surface text-muted-foreground")
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
              <ScanUploader
                onFiles={(files) => {
                  track("spaceplanner_image_uploaded", { props: { mode: "belongings" } });
                  stuff.addFiles(files);
                }}
                rejected={stuff.rejected}
                disabled={!stuff.canAddMore}
                title="Show Spacilo AI your belongings"
                hint="Boxes, furniture, bikes, appliances — a few clear photos is plenty."
              />
              <PhotoGallery
                photos={stuff.photos}
                onRemove={stuff.removePhoto}
                onRotate={stuff.rotatePhoto}
                onMove={stuff.movePhoto}
                canAddMore={stuff.canAddMore}
              />
              {stuff.photos.length > 0 ? (
                <Button type="button" size="lg" onClick={() => void analyseStuff()}>
                  <Sparkles aria-hidden="true" />
                  {stuff.objects.length > 0 ? "Analyse again" : "Analyse my belongings"}
                </Button>
              ) : null}
              {stuff.objects.length > 0 ? (
                <>
                  <DetectedInventory
                    objects={stuff.objects}
                    actions={stuff.editor}
                    onAdd={stuff.editor.add}
                  />
                  <Button type="button" variant="secondary" size="lg" onClick={() => setStep("space")}>
                    Now show us the space
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </>
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
                onFiles={(files) => {
                  track("spaceplanner_image_uploaded", { props: { mode: "space" } });
                  space.addFiles(files);
                }}
                rejected={space.rejected}
                disabled={!space.canAddMore}
                title="Now show us the space"
                hint="A garage, spare room, loft or unit — include the door or access route."
              />
              <PhotoGallery
                photos={space.photos}
                onRemove={space.removePhoto}
                onRotate={space.rotatePhoto}
                onMove={space.movePhoto}
                canAddMore={space.canAddMore}
              />
              {space.photos.length > 0 ? (
                <Button type="button" size="lg" onClick={() => void analyseSpace()}>
                  <Camera aria-hidden="true" />
                  Analyse this space
                </Button>
              ) : null}

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
              <SpacePlannerResult result={result}>
                {space.photos[0] ? (
                  <PhotoArrangement
                    photoUrl={space.photos[0].url}
                    space={result.space}
                    pack={result.plan.after}
                    description={`Spacilo AI arranged ${result.itemCount} items into the space you photographed. Estimated fit ${result.fitPercent}%, with about ${result.spaceRemainingM3.toFixed(1)}m³ estimated to remain.`}
                  />
                ) : (
                  <p className="type-body-sm text-muted-foreground">
                    Add a photo of the space to see your belongings arranged inside it.
                  </p>
                )}
              </SpacePlannerResult>

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
    </div>
  );
}

export default SpacePlannerStudio;
