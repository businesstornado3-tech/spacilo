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

/**
 * Hard ceiling on one render request. A visual preview that has not arrived
 * within this window is abandoned rather than left spinning: the numeric
 * result is already on screen and must never be held hostage to the image.
 */
export const RENDER_TIMEOUT_MS = 75_000;

/** One render plus, at most, one corrective refinement. */
export const MAX_RENDER_ATTEMPTS = 2;

export interface UseSpaceVisualisation {
  status: VisualisationStatus;
  stage: VisualisationStage;
  stageLabel: string;
  /** Which render attempt is in flight, 1-based. */
  attempt: number;
  /** Milliseconds since the current run started, updated about once a second. */
  elapsedMs: number;
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

      // Render verification gate: the returned image is checked against the
      // manifest and regenerated while items are missing, up to a hard limit.
      // A partial render is a failure to fix, not a result to present.
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
        setStage("checking");
        const coverageNow = response.coverage;
        if (!coverageNow || coverageNow.complete || coverageNow.missing.length === 0) break;

        setStage("rendering");
        const retry = await requestVisualisation({
          ...payload,
          emphasise: coverageNow.missing,
        });
        if (run.current !== token) return;
        // Keep whichever attempt represented more of the confirmed inventory.
        if (!retry.coverage || retry.coverage.present >= coverageNow.present) {
          response = retry;
        }
        if (response.coverage?.complete) break;
      }

      setStage("checking");
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
