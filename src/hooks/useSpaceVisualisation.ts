/**
 * useSpaceVisualisation — runs the SpacePlanner image-to-image visualisation.
 *
 * Holds an honest status: nothing is labelled "AI arranged" until a real
 * edited photograph has come back from the model.
 */
import * as React from "react";

import {
  buildVisualisationInstruction,
  requestVisualisation,
  toVisualisationImage,
  VISUALISATION_STAGES,
  type VisualisationStage,
} from "@/lib/spaceplanner/photo/visualise";
import type { PhotoPlanResult } from "@/lib/spaceplanner/photo";
import type { DetectedObject, VisionPhoto } from "@/lib/vision/types";

export type VisualisationStatus = "idle" | "working" | "ready" | "failed";

export interface UseSpaceVisualisation {
  status: VisualisationStatus;
  stage: VisualisationStage;
  stageLabel: string;
  imageUrl: string | null;
  error: string | null;
  generate: () => Promise<void>;
  reset: () => void;
}

export function useSpaceVisualisation(options: {
  result: PhotoPlanResult | null;
  objects: DetectedObject[];
  spacePhoto: VisionPhoto | null;
  itemPhotos: VisionPhoto[];
}): UseSpaceVisualisation {
  const { result, objects, spacePhoto, itemPhotos } = options;
  const [status, setStatus] = React.useState<VisualisationStatus>("idle");
  const [stage, setStage] = React.useState<VisualisationStage>("analysing");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useRef(0);

  const generate = React.useCallback(async () => {
    if (!result || !spacePhoto) return;
    const token = ++run.current;
    setStatus("working");
    setStage("analysing");
    setError(null);
    setImageUrl(null);

    try {
      const space = await toVisualisationImage(spacePhoto.url);
      if (run.current !== token) return;
      setStage("placing");
      const items = await Promise.all(
        itemPhotos.slice(0, 3).map((photo) => toVisualisationImage(photo.url)),
      );
      if (run.current !== token) return;
      setStage("rendering");
      const image = await requestVisualisation({
        spaceImage: space,
        itemImages: items,
        instruction: buildVisualisationInstruction(result, objects),
      });
      if (run.current !== token) return;
      setImageUrl(image);
      setStatus("ready");
    } catch (cause) {
      if (run.current !== token) return;
      setError(cause instanceof Error ? cause.message : "unknown");
      setStatus("failed");
    }
  }, [result, objects, spacePhoto, itemPhotos]);

  const reset = React.useCallback(() => {
    run.current += 1;
    setStatus("idle");
    setImageUrl(null);
    setError(null);
  }, []);

  const stageLabel =
    VISUALISATION_STAGES.find((entry) => entry.id === stage)?.label ??
    VISUALISATION_STAGES[0]!.label;

  return { status, stage, stageLabel, imageUrl, error, generate, reset };
}
