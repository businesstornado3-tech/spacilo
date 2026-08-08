/**
 * ScanMySpacePanel — the first step of the host journey.
 *
 * Photograph the garage, loft or spare room; Spacilo AI estimates the usable
 * storage and what it could realistically earn. Nothing here is a promise.
 */
import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HostEntryButton } from "@/components/home/HostEntryButton";
import { ScanUploader } from "@/components/vision/ScanUploader";
import { PhotoGallery } from "@/components/vision/PhotoGallery";
import { VisionAnalysis } from "@/components/vision/VisionAnalysis";
import { SpaceScanSummary } from "@/components/vision/SpaceScanSummary";
import { useVisionAI } from "@/hooks/useVisionAI";
import { estimateSpaceValue, type ValueSpaceType } from "@/lib/vision";

export function ScanMySpacePanel({
  spaceType = "garage",
  postcode = "",
}: {
  spaceType?: ValueSpaceType;
  postcode?: string;
}) {
  const vision = useVisionAI({ mode: "space", spaceType });

  const estimate = React.useMemo(
    () =>
      vision.spaceScan
        ? estimateSpaceValue({
            spaceType,
            areaM2: vision.spaceScan.usableAreaM2,
            postcode,
          })
        : null,
    [vision.spaceScan, spaceType, postcode],
  );

  return (
    <div className="space-y-4">
      {vision.status !== "analysing" ? (
        <>
          <ScanUploader
            onFiles={vision.addFiles}
            rejected={vision.rejected}
            disabled={!vision.canAddMore}
            title="Show Spacilo AI your space"
            hint="Photograph the whole space, plus the door or access route."
          />
          <PhotoGallery
            photos={vision.photos}
            onRemove={vision.removePhoto}
            onRotate={vision.rotatePhoto}
            onMove={vision.movePhoto}
            canAddMore={vision.canAddMore}
          />
        </>
      ) : (
        <VisionAnalysis
          stages={vision.stages}
          stageIndex={vision.stageIndex}
          title="Spacilo AI is analysing your space"
        />
      )}

      {vision.photos.length > 0 && vision.status !== "analysing" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="lg" onClick={() => void vision.analyse()}>
            <Sparkles aria-hidden="true" />
            {vision.spaceScan ? "Scan again" : "Scan my space"}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={vision.reset}>
            <RefreshCw aria-hidden="true" />
            Start again
          </Button>
        </div>
      ) : null}

      {vision.error ? (
        <p role="alert" className="rounded-xl bg-warning-soft p-3 type-body-sm text-warning-soft-foreground">
          {vision.error}
        </p>
      ) : null}

      {vision.spaceScan && estimate ? (
        <>
          <SpaceScanSummary scan={vision.spaceScan} estimate={estimate} />
          <HostEntryButton label="List this space" from="vision_space_scan" block />
        </>
      ) : null}
    </div>
  );
}

export default ScanMySpacePanel;
