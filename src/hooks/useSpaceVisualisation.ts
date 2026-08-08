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

export type VisualisationStatus =
  | "idle"
  | "working"
  | "ready"
  | "incomplete"
  /** A render that contained objects the user does not own. Never shown. */
  | "rejected"
  | "failed";

/**
 * Hard ceiling on one render request. A visual preview that has not arrived
 * within this window is abandoned rather than left spinning: the numeric
 * result is already on screen and must never be held hostage to the image.
 */
export const RENDER_TIMEOUT_MS = 95_000;

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


/** Prefers the render that is faithful first, then the most complete. */
function betterRender(next: CoverageReport, current: CoverageReport): boolean {
  const nextInvented = next.unexpected?.length ?? 0;
  const currentInvented = current.unexpected?.length ?? 0;
  if (nextInvented !== currentInvented) return nextInvented < currentInvented;
  return next.present >= current.present;
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
  const [attempt, setAttempt] = React.useState(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const run = React.useRef(0);
  const abort = React.useRef<AbortController | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopClock = React.useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    abort.current?.abort();
  }, []);

  const generate = React.useCallback(async () => {
    if (!result || !spacePhoto || !manifest) {
      setError("verified_manifest_required");
      setStatus("failed");
      return;
    }
    const renderItems = manifestPayload(manifest);
    // Items the planner could not fit are legitimately absent from the render
    // list; only an empty list means there is nothing to draw.
    if (renderItems.length === 0) {
      setError("inventory_not_fully_placeable");
      setStatus("failed");
      return;
    }
    const token = ++run.current;
    abort.current?.abort();
    setStatus("working");
    setStage("planning");
    setError(null);
    setImageUrl(null);
    setCoverage(null);
    setAttempt(1);

    // Elapsed time is surfaced so the wait is honest rather than a spinner
    // with no end in sight.
    const startedAt = Date.now();
    setElapsedMs(0);
    stopClock();
    timer.current = setInterval(() => {
      if (run.current !== token) return;
      setElapsedMs(Date.now() - startedAt);
    }, 1000);

    /** One render request, abandoned rather than left hanging. */
    const render = async (body: Parameters<typeof requestVisualisation>[0]) => {
      const controller = new AbortController();
      abort.current = controller;
      const guard = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
      try {
        return await requestVisualisation(body, fetch, { signal: controller.signal });
      } finally {
        clearTimeout(guard);
      }
    };

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
        manifest: renderItems,
        roomFeatures: manifest.roomFeatures,
      };

      let response = await render(payload);
      if (run.current !== token) return;

      // Render verification gate. A render is only accepted when it shows
      // every confirmed item AND invents nothing. One corrective pass is
      // attempted with the same manifest — the planner is never asked to
      // replan — and after that the result is reported honestly.
      for (let pass = 1; pass < MAX_RENDER_ATTEMPTS; pass += 1) {
        setStage("checking");
        const coverageNow = response.coverage;
        // An unverifiable render is not a wrong render: the checker simply
        // could not answer. It is shown, flagged as unverified.
        if (!coverageNow) break;
        const missingItems = coverageNow.missing.length > 0;
        const invented = (coverageNow.unexpected?.length ?? 0) > 0;
        if (!missingItems && !invented) break;

        setAttempt(pass + 1);
        setStage("rendering");
        const retry = await render({
          ...payload,
          nonce: pass,
          ...(missingItems ? { emphasise: coverageNow.missing } : {}),
        });
        if (run.current !== token) return;
        if (!retry.coverage || betterRender(retry.coverage, coverageNow)) response = retry;
        if (response.coverage?.complete && (response.coverage.unexpected?.length ?? 0) === 0) break;
      }

      const finalCoverage = response.coverage;
      setStage("checking");
      setCoverage(finalCoverage);

      // Only an image proven to contain belongings the user does not own is
      // withheld. A physically wrong but attractive image is worse than none.
      if (response.verification === "unfaithful") {
        setImageUrl(null);
        setStatus("rejected");
        return;
      }

      setImageUrl(response.image);
      setStatus(response.verification === "incomplete" ? "incomplete" : "ready");
    } catch (cause) {
      if (run.current !== token) return;
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      setError(aborted ? "timed_out" : cause instanceof Error ? cause.message : "unknown");
      setStatus("failed");
    } finally {
      if (run.current === token) stopClock();
    }
  }, [result, objects, manifest, spacePhoto, itemPhotos, stopClock]);


  const reset = React.useCallback(() => {
    run.current += 1;
    abort.current?.abort();
    stopClock();
    setStatus("idle");
    setImageUrl(null);
    setCoverage(null);
    setError(null);
    setAttempt(0);
    setElapsedMs(0);
  }, [stopClock]);

  const stageLabel =
    VISUALISATION_STAGES.find((entry) => entry.id === stage)?.label ??
    VISUALISATION_STAGES[0]!.label;

  return {
    status,
    stage,
    stageLabel,
    attempt,
    elapsedMs,
    imageUrl,
    coverage,
    error,
    generate,
    reset,
  };

}
