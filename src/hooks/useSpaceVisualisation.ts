/**
 * useSpaceVisualisation — runs the SpacePlanner image-to-image visualisation.
 *
 * Downstream of the confirmed inventory: it prepares the photographs in
 * parallel, sends the placement manifest, and checks what came back against
 * that manifest. Nothing is labelled "AI arranged" until a real edited
 * photograph has come back; nothing is called complete until the manifest is
 * satisfied. One controlled refinement is attempted automatically.
 */
import * as React from "react";

import {
  buildVisualisationInstruction,
  manifestPayload,
  requestVisualisation,
  VISUALISATION_STAGES,
  type VisualisationStage,
} from "@/lib/spaceplanner/photo/visualise";
import { prepareImage } from "@/lib/spaceplanner/photo/image-optimise";
import type { CoverageReport, PlacementManifest } from "@/lib/spaceplanner/photo/manifest";
import type { PhotoPlanResult } from "@/lib/spaceplanner/photo";
import type { DetectedObject, VisionPhoto } from "@/lib/vision/types";

export type VisualisationStatus = "idle" | "working" | "ready" | "incomplete" | "failed";

export interface UseSpaceVisualisation {
  status: VisualisationStatus;
  stage: VisualisationStage;
  stageLabel: string;
  imageUrl: string | null;
  coverage: CoverageReport | null;
  error: string | null;
  generate: () => Promise<void>;
  reset: () => void;
}

export function useSpaceVisualisation(options: {
  result: PhotoPlanResult | null;
  objects: DetectedObject[];
  manifest?: PlacementManifest | null;
  spacePhoto: VisionPhoto | null;
  itemPhotos: VisionPhoto[];
}): UseSpaceVisualisation {
  const { result, objects, manifest, spacePhoto, itemPhotos } = options;
  const [status, setStatus] = React.useState<VisualisationStatus>("idle");
  const [stage, setStage] = React.useState<VisualisationStage>("rendering");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [coverage, setCoverage] = React.useState<CoverageReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useRef(0);

  const generate = React.useCallback(async () => {
    if (!result || !spacePhoto) return;
    const token = ++run.current;
    setStatus("working");
    setStage("planning");
    setError(null);
    setImageUrl(null);
    setCoverage(null);

    try {
      // Prepare every photograph at once rather than one after another.
      const [space, ...items] = await Promise.all([
        prepareImage(spacePhoto.url),
        ...itemPhotos.slice(0, 3).map((photo) => prepareImage(photo.url)),
      ]);
      if (run.current !== token || !space) return;

      setStage("rendering");
      const payload = {
        spaceImage: space,
        itemImages: items,
        instruction: buildVisualisationInstruction(result, objects, manifest ?? undefined),
        ...(manifest ? { manifest: manifestPayload(manifest) } : {}),
      };

      let response = await requestVisualisation(payload);
      if (run.current !== token) return;

      setStage("checking");
      // One controlled refinement when the check says items are missing.
      if (response.coverage && !response.coverage.complete && response.coverage.missing.length) {
        const retry = await requestVisualisation({
          ...payload,
          emphasise: response.coverage.missing,
        });
        if (run.current !== token) return;
        if (!retry.coverage || retry.coverage.complete || retry.coverage.present > response.coverage.present) {
          response = retry;
        }
      }

      setImageUrl(response.image);
      setCoverage(response.coverage);
      setStatus(response.coverage && !response.coverage.complete ? "incomplete" : "ready");
    } catch (cause) {
      if (run.current !== token) return;
      setError(cause instanceof Error ? cause.message : "unknown");
      setStatus("failed");
    }
  }, [result, objects, manifest, spacePhoto, itemPhotos]);

  const reset = React.useCallback(() => {
    run.current += 1;
    setStatus("idle");
    setImageUrl(null);
    setCoverage(null);
    setError(null);
  }, []);

  const stageLabel =
    VISUALISATION_STAGES.find((entry) => entry.id === stage)?.label ??
    VISUALISATION_STAGES[0]!.label;

  return { status, stage, stageLabel, imageUrl, coverage, error, generate, reset };
}
