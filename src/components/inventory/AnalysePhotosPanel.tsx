import * as React from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/common/Alert";
import { SpaceFitScanning } from "@/components/trust/SpaceFitAI";
import { useAnalysePhotos, useLatestAnalysisRun } from "@/hooks/useSpaceFitVision";
import { MAX_PHOTOS_PER_ANALYSIS, VISION_ERROR_MESSAGES } from "@/lib/spacefit-vision/schema";
import type { InventoryPhoto } from "@/lib/inventory-model";

/**
 * The renter's entry point into SpaceFit Vision.
 *
 * Analysis is always explicit — photos are never sent anywhere on upload.
 */
export function AnalysePhotosPanel({
  inventoryId,
  photos,
  onReviewReady,
}: {
  inventoryId: string;
  photos: InventoryPhoto[];
  onReviewReady: () => void;
}) {
  const analyse = useAnalysePhotos(inventoryId);
  const { data: run } = useLatestAnalysisRun(inventoryId);
  const [failure, setFailure] = React.useState<string | null>(null);

  const selectable = photos.slice(0, MAX_PHOTOS_PER_ANALYSIS);
  const overflow = photos.length - selectable.length;

  if (photos.length === 0) return null;

  const start = async () => {
    setFailure(null);
    const result = await analyse.mutateAsync(selectable.map((photo) => photo.id));
    if (!result.ok) {
      setFailure(result.message ?? VISION_ERROR_MESSAGES.unknown);
      return;
    }
    if (result.detectionCount === 0) {
      setFailure(
        "We couldn't confidently identify anything in those photos. Try clearer, well-lit shots — or add items manually.",
      );
      return;
    }
    onReviewReady();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 type-h2">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        Analyse with Spacilo AI
      </h2>
      <p className="mt-1 type-body text-muted-foreground">
        We&apos;ll suggest what you&apos;re storing from{" "}
        {selectable.length === 1 ? "your photo" : `your ${selectable.length} photos`}. You review and
        correct everything before anything is added to My Stuff.
      </p>
      {overflow > 0 ? (
        <p className="mt-2 type-body-sm text-muted-foreground">
          We&apos;ll analyse the first {MAX_PHOTOS_PER_ANALYSIS} photos this time.
        </p>
      ) : null}

      {analyse.isPending ? (
        <div className="mt-4">
          <SpaceFitScanning label="Looking at your photos…" />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void start()}>
            <Sparkles aria-hidden="true" />
            {run && run.detection_count > 0 ? "Analyse again" : "Analyse my photos"}
          </Button>
        </div>
      )}

      {failure ? (
        <Alert tone="warning" className="mt-4" title="We couldn't finish that scan">
          {failure}
        </Alert>
      ) : null}

      <p className="mt-4 type-body-xs text-muted-foreground">
        Your photos stay private. They&apos;re only sent for analysis when you tap the button, and
        Spacilo AI estimates — it doesn&apos;t measure.
      </p>
    </section>
  );
}
