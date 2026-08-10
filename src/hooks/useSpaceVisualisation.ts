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
import { prepareImageOnce } from "@/lib/spaceplanner/photo/image-optimise";
import {
  manifestSupports,
  type CoverageReport,
  type PlacementManifest,
} from "@/lib/spaceplanner/photo/manifest";
import type { PhotoPlanResult } from "@/lib/spaceplanner/photo";
import type { DetectedObject, VisionPhoto } from "@/lib/vision/types";

/**
 * Phase 6T — the strict image state machine.
 *
 * Exactly one state shows the rendered photograph: "verified". Every other
 * outcome — an invented object, a missing item, a checker that could not
 * answer, a timeout — falls back to the measured arrangement plan. There is no
 * path from "we could not check it" to "here is your arrangement".
 */
export type VisualisationStatus =
  | "idle"
  | "preparing"
  | "rendering"
  | "verifying"
  /** Checked and faithful. THE ONLY STATE THAT DISPLAYS AN IMAGE. */
  | "verified"
  /** Contained objects the user does not own, or contradicted the plan. */
  | "unfaithful"
  /** Faithful, but did not show every planned item. */
  | "incomplete"
  /** The render arrived but could not be checked. Never displayed. */
  | "unverified"
  /**
   * Phase 6AD — the preview outstayed its UX budget. We stop making the user
   * wait and the measured plan stands on its own. The request may still be in
   * flight in the background; if it lands verified, the preview appears.
   */
  | "unavailable"
  | "failed";

/** True while the pipeline is still doing work the USER is waiting on. */
export function isVisualisationWorking(status: VisualisationStatus): boolean {
  return status === "preparing" || status === "rendering" || status === "verifying";
}

/** True only for the one state permitted to display the rendered image. */
export function showsRenderedImage(status: VisualisationStatus): boolean {
  return status === "verified";
}

/**
 * Phase 6AD — WHY a preview stopped. Live failures were all reported as
 * "timed_out", which hid the fact that the render had usually succeeded and
 * the CHECK, or our own shared ceiling, was what ran out. Each cause is now
 * named so the log line and the diagnostics panel say what actually happened.
 */
export type PreviewAbortReason =
  | "user_cancelled"
  | "ux_deadline"
  | "client_timeout"
  | "server_render_timeout"
  | "server_verify_timeout"
  | "gateway_busy"
  | "gateway_unreachable"
  | "no_image"
  | "unknown";

/** Maps a failure code to the reason a person would recognise. */
export function abortReasonFor(code: string | null): PreviewAbortReason {
  switch (code) {
    case "timed_out":
      return "client_timeout";
    case "render_timeout":
      return "server_render_timeout";
    case "upstream_429":
    case "upstream_402":
      return "gateway_busy";
    case "not_configured":
    case "upstream_unreachable":
      return "gateway_unreachable";
    case "no_image_returned":
    case "bad_upstream_payload":
      return "no_image";
    default:
      return code ? "unknown" : "unknown";
  }
}

/**
 * A retry only ever buys something when the FAULT IS IN THE PICTURE. A
 * timeout, a busy gateway or an unreachable service will not answer differently
 * because we asked twice — it will just spend another render's worth of time
 * and credits while the deterministic plan is already on screen.
 */
export function isRetryableFailure(code: string | null): boolean {
  const neverRetry: ReadonlySet<string> = new Set([
    "timed_out",
    "render_timeout",
    "upstream_429",
    "upstream_402",
    "upstream_unreachable",
    "not_configured",
    "no_image_returned",
    "bad_upstream_payload",
    "verified_manifest_required",
    "inventory_not_fully_placeable",
  ]);
  return code !== null && !neverRetry.has(code);
}

/**
 * Hard ceiling on ONE render request. Live evidence puts a successful render
 * at 21–38s and its check at 6–22s, so 45s is generous for a good attempt and
 * decisive about a bad one. Phase 6AB: two 95-second attempts used to produce
 * a 90–120 second dead wait for an OPTIONAL preview while the deterministic
 * arrangement had been on screen the whole time. Never again.
 *
 * Phase 6AD: this is now a BACKGROUND ceiling, not the user's wait. The server
 * bounds render (35s) and check (10s) separately, so the client ceiling sits
 * just above their sum — a good render is never thrown away because the check
 * was slow.
 */
export const RENDER_TIMEOUT_MS = 55_000;

/**
 * The user's budget, which is a different thing from the network's. After this
 * the spinner stops and the measured plan is presented as the result. Anything
 * still in flight becomes a quiet upgrade rather than a wait.
 */
export const PREVIEW_UX_DEADLINE_MS = 20_000;

/**
 * Phase 6AA — one render, plus at most one corrective redraw, and only when a
 * redraw is the right answer.
 */
export const MAX_RENDER_ATTEMPTS = 2;

/**
 * A second render is worth its wait only when the fault is "something the plan
 * asked for is not drawn". Invented objects and refused support relationships
 * fail closed on the first attempt: the deterministic plan is already visible,
 * and asking the same model again reliably reproduces the same mistake.
 *
 * Room-feature drift is never a retry trigger — redrawing the room's own door
 * slightly differently is not a plan failure.
 */
export function shouldRetryRender(coverage: {
  missing: string[];
  unexpected?: string[];
  supportIssues?: unknown[];
}): boolean {
  if ((coverage.unexpected?.length ?? 0) > 0) return false;
  if ((coverage.supportIssues?.length ?? 0) > 0) return false;
  return coverage.missing.length > 0;
}


export interface RenderDiagnostics {
  provider: string | null;
  model: string | null;
  diagnosticId: string | null;
  planHash: string | null;
  /** The inventory the image was rendered for. Guards against stale images. */
  inventoryHash: string | null;
  renderMs: number | null;
  /** Milliseconds spent optimising the photographs before the render call. */
  prepareMs?: number | null;
  /** Milliseconds spent on render verification. */
  verifyMs?: number | null;
  /** Wall-clock time from pressing generate to a decided verdict. */
  totalMs?: number | null;
  /** Render + check as measured on the server, excluding the network. */
  serverTotalMs?: number | null;
  /** True when the CHECK ran out of time — the render itself succeeded. */
  verifyTimedOut?: boolean;
  /** True when the user's 20s budget expired before the verdict arrived. */
  uxDeadlineExceeded?: boolean;
  /** How many render requests this run actually spent. */
  renderRequests?: number;
  /** Why the preview stopped, when it did not finish verified. */
  abortReason?: PreviewAbortReason | null;
}

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
  /** Named cause when the preview did not finish verified. */
  abortReason: PreviewAbortReason | null;
  /** Which service actually rendered, for support and verification. */
  diagnostics: RenderDiagnostics | null;
  generate: (options?: { force?: boolean }) => Promise<void>;
  reset: () => void;
}




/** Prefers the render that is faithful first, then the most complete. */
function betterRender(next: CoverageReport, current: CoverageReport): boolean {
  const nextInvented = next.unexpected?.length ?? 0;
  const currentInvented = current.unexpected?.length ?? 0;
  if (nextInvented !== currentInvented) return nextInvented < currentInvented;
  return next.present >= current.present;
}

/**
 * Phase 6AB — one reference photograph per physical object, not every
 * photograph that happens to contain it.
 *
 * Detection still uses every photo. The RENDERER only needs to see each
 * object once: sending the same suitcase three times inflates the payload,
 * slows the render and tempts the model into drawing three suitcases.
 * Deterministic greedy set cover — photographs are chosen for how many
 * not-yet-covered objects they contribute, ties broken by upload order.
 */
export function representativeItemPhotos(
  photos: VisionPhoto[],
  objects: DetectedObject[],
  max: number,
): VisionPhoto[] {
  if (photos.length <= 1 || objects.length === 0) return photos.slice(0, max);
  const covered = new Set<string>();
  const remaining = [...photos];
  const chosen: VisionPhoto[] = [];

  while (chosen.length < max && remaining.length > 0) {
    let bestIndex = 0;
    let bestGain = -1;
    remaining.forEach((photo, index) => {
      const gain = objects.filter(
        (object) =>
          object.photoIds.includes(photo.id) &&
          !covered.has(object.identityGroupId ?? object.id),
      ).length;
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = index;
      }
    });
    if (bestGain <= 0) break;
    const [photo] = remaining.splice(bestIndex, 1);
    if (!photo) break;
    for (const object of objects) {
      if (object.photoIds.includes(photo.id)) covered.add(object.identityGroupId ?? object.id);
    }
    chosen.push(photo);
  }

  return chosen.length > 0 ? chosen : photos.slice(0, max);
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
  const [diagnostics, setDiagnostics] = React.useState<RenderDiagnostics | null>(null);

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
    setStatus("preparing");
    setStage("planning");
    setError(null);
    setImageUrl(null);
    setCoverage(null);
    setDiagnostics(null);

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
      const preparedAt = Date.now();
      const [space, ...items] = await Promise.all([
        prepareImageOnce(spacePhoto.url),
        ...representativeItemPhotos(itemPhotos, objects, 3).map((photo) =>
          prepareImageOnce(photo.url),
        ),
      ]);
      if (run.current !== token || !space) return;
      const prepareMs = Date.now() - preparedAt;

      setStage("rendering");
      setStatus("rendering");
      const payload = {
        spaceImage: space,
        itemImages: items,
        instruction: buildVisualisationInstruction(result, objects, manifest ?? undefined),
        manifest: renderItems,
        roomFeatures: manifest.roomFeatures,
        supports: manifestSupports(manifest),
        // Part of the cache key AND of the diagnostics. Retries resend the
        // SAME plan — never a new one.
        planHash: manifest.planHash,
        inventoryHash: manifest.inventoryId,
      };

      const renderedAt = Date.now();
      let response = await render(payload);
      if (run.current !== token) return;
      const renderWallMs = Date.now() - renderedAt;

      // Render verification gate. A render is only accepted when it shows
      // every confirmed item, invents nothing, and honours every support
      // relationship the plan asserted. One corrective pass is attempted with
      // the same manifest — the planner is never asked to replan.
      const verifiedAt = Date.now();
      for (let pass = 1; pass < MAX_RENDER_ATTEMPTS; pass += 1) {
        setStage("checking");
        setStatus("verifying");
        const coverageNow = response.coverage;
        // An unverifiable render is not a wrong render: the checker simply
        // could not answer. It is not shown either way.
        if (!coverageNow) break;
        // Phase 6AA — a second render is spent ONLY on the one fault a redraw
        // can actually fix. An invented object or a support the model refused
        // to draw fails closed immediately: the plan is already on screen and
        // is worth more than another render's wait and cost.
        if (!shouldRetryRender(coverageNow)) break;
        const missingItems = coverageNow.missing.length > 0;


        setAttempt(pass + 1);
        setStage("rendering");
        setStatus("rendering");
        const retry = await render({
          ...payload,
          nonce: pass,
          ...(missingItems ? { emphasise: coverageNow.missing } : {}),
        });
        if (run.current !== token) return;
        if (!retry.coverage || betterRender(retry.coverage, coverageNow)) response = retry;
        if (
          response.coverage?.complete &&
          (response.coverage.unexpected?.length ?? 0) === 0 &&
          (response.coverage.supportIssues?.length ?? 0) === 0
        ) {
          break;
        }
      }

      const finalCoverage = response.coverage;
      setStage("checking");
      setStatus("verifying");
      setCoverage(finalCoverage);
      setDiagnostics({
        provider: response.provider,
        model: response.model,
        diagnosticId: response.diagnosticId,
        planHash: manifest.planHash,
        inventoryHash: manifest.inventoryId,
        renderMs: response.renderMs ?? renderWallMs,
        prepareMs,
        verifyMs: Date.now() - verifiedAt,
        totalMs: Date.now() - startedAt,
      });

      // FAIL-CLOSED (Phase 6T). Only a render that was actually checked AND
      // passed every check is shown. An invented object, a plan contradiction,
      // a missing item or a checker that could not answer all fall back to the
      // measured arrangement plan — the image is discarded, not downgraded.
      const inventedFinal = (finalCoverage?.unexpected?.length ?? 0) > 0;
      const driftedFinal = (finalCoverage?.supportIssues?.length ?? 0) > 0;
      if (response.verification === "unfaithful" || inventedFinal || driftedFinal) {
        setImageUrl(null);
        setStatus("unfaithful");
        return;
      }
      if (!finalCoverage || response.verification === "unverified") {
        setImageUrl(null);
        setStatus("unverified");
        return;
      }
      if (response.verification === "incomplete" || !finalCoverage.complete) {
        setImageUrl(null);
        setStatus("incomplete");
        return;
      }

      setImageUrl(response.image);
      setStatus("verified");

    } catch (cause) {
      if (run.current !== token) return;
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      // Phase 6AC — a preview that timed out or failed must leave nothing
      // behind. The deterministic SVG plan stays on screen; no stale or
      // unverified image is ever allowed to survive a failed run.
      setImageUrl(null);
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
    setDiagnostics(null);

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
    diagnostics,

    generate,
    reset,
  };

}
