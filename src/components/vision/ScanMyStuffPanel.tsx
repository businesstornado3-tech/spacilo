/**
 * ScanMyStuffPanel — the complete "photograph your belongings" journey.
 *
 * Upload → gallery → AI analysis → editable inventory → summary → planner.
 * Composed entirely from reusable Vision AI parts, so hosts, renters and
 * visitors all get the same experience with different allowances.
 */
import * as React from "react";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScanUploader } from "@/components/vision/ScanUploader";
import { PhotoGallery } from "@/components/vision/PhotoGallery";
import { VisionAnalysis } from "@/components/vision/VisionAnalysis";
import { DetectedInventory } from "@/components/vision/DetectedInventory";
import { InventorySummary } from "@/components/vision/InventorySummary";
import { useVisionAI } from "@/hooks/useVisionAI";
import { toPlannerQuantities } from "@/lib/vision";
import { capabilitiesFor, type PlannerMode } from "@/lib/spaceplanner";

export function ScanMyStuffPanel({
  mode = "visitor",
  onUseInPlanner,
  planLabel = "Plan this in SpacePlanner",
}: {
  mode?: PlannerMode;
  onUseInPlanner?: (quantities: Record<string, number>) => void;
  planLabel?: string;
}) {
  const vision = useVisionAI({ mode: "belongings" });
  const capabilities = capabilitiesFor(mode);
  const [scans, setScans] = React.useState(0);
  const scanLimitReached = mode === "visitor" && scans >= 1;

  const run = async () => {
    await vision.analyse();
    setScans((count) => count + 1);
  };

  return (
    <div className="space-y-4">
      {vision.status !== "analysing" ? (
        <ScanUploader
          onFiles={vision.addFiles}
          rejected={vision.rejected}
          disabled={!vision.canAddMore}
        />
      ) : null}

      {vision.status !== "analysing" ? (
        <PhotoGallery
          photos={vision.photos}
          onRemove={vision.removePhoto}
          onRotate={vision.rotatePhoto}
          onMove={vision.movePhoto}
          canAddMore={vision.canAddMore}
        />
      ) : null}

      {vision.status === "analysing" ? (
        <VisionAnalysis stages={vision.stages} stageIndex={vision.stageIndex} />
      ) : null}

      {vision.photos.length > 0 && vision.status !== "analysing" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="lg" onClick={() => void run()} disabled={scanLimitReached}>
            <Sparkles aria-hidden="true" />
            {vision.status === "complete" ? "Analyse again" : "Analyse my photos"}
          </Button>
          {vision.photos.length > 0 ? (
            <Button type="button" variant="outline" size="lg" onClick={vision.reset}>
              <RefreshCw aria-hidden="true" />
              Start again
            </Button>
          ) : null}
        </div>
      ) : null}

      {scanLimitReached && !capabilities.canSavePlans ? (
        <p className="type-body-sm text-muted-foreground">
          That&apos;s your free preview scan. Create an account for unlimited scans and saved
          inventories.
        </p>
      ) : null}

      {vision.error ? (
        <p role="alert" className="rounded-xl bg-warning-soft p-3 type-body-sm text-warning-soft-foreground">
          {vision.error}
        </p>
      ) : null}

      {vision.status === "complete" && vision.objects.length > 0 ? (
        <>
          <InventorySummary summary={vision.summary} />
          <DetectedInventory
            objects={vision.objects}
            actions={vision.editor}
            onAdd={vision.editor.add}
          />
          {onUseInPlanner ? (
            <Button
              type="button"
              size="lg"
              block
              className="sm:w-auto"
              onClick={() => onUseInPlanner(toPlannerQuantities(vision.objects))}
            >
              {planLabel}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default ScanMyStuffPanel;
