import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from "lucide-react";

import {
  isVisualisationWorking,
  type RenderDiagnostics,
  type VisualisationStatus,
} from "@/hooks/useSpaceVisualisation";
import { manifestHash, verificationStatusOf } from "@/lib/spaceplanner/photo/diagnostics";
import type {
  CanonicalInventory,
  CoverageReport,
  PlacementManifest,
import {
  EMPTY_TIMINGS,
  budgetReport,
  formatMs,
  type BudgetVerdict,
  type PipelineTimings,
} from "@/lib/spaceplanner/photo/timings";
} from "@/lib/spaceplanner/photo/manifest";

type StageState = "waiting" | "working" | "passed" | "failed";

function StageIcon({ state }: { state: StageState }) {
  if (state === "passed") return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (state === "failed") return <CircleAlert className="size-4 text-destructive" aria-hidden="true" />;
  if (state === "working") return <LoaderCircle className="size-4 animate-spin text-info" aria-hidden="true" />;
  return <Circle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

export function SpacePlannerDiagnostics({
  photoCount,
  detectedCount,
  inventory,
  roomReady,
  manifest,
  visualStatus,
  coverage,
  render,
  timings = EMPTY_TIMINGS,
}: {
  photoCount: number;
  detectedCount: number;
  inventory: CanonicalInventory | null;
  roomReady: boolean;
  manifest: PlacementManifest | null;
  visualStatus: VisualisationStatus;
  coverage: CoverageReport | null;
  /** Which service produced the image, for support and provider verification. */
  render?: RenderDiagnostics | null;
  /** Phase 6U — measured stage timings and their budget verdicts. */
  timings?: PipelineTimings;
}) {
  const budgets = budgetReport(timings);

  const renderWorking = isVisualisationWorking(visualStatus);
  const renderFailed =
    visualStatus === "failed" || visualStatus === "unfaithful" || visualStatus === "unverified";
  const verified = verificationStatusOf(coverage);
  const stages: { label: string; state: StageState }[] = [
    { label: "Photos", state: photoCount > 0 ? "passed" : "waiting" },
    { label: "Detection", state: detectedCount > 0 ? "passed" : photoCount > 0 ? "working" : "waiting" },
    { label: "Inventory verification", state: inventory ? "passed" : detectedCount > 0 ? "working" : "waiting" },
    { label: "Room analysis", state: roomReady ? "passed" : inventory ? "working" : "waiting" },
    { label: "Physical plan", state: manifest ? "passed" : roomReady ? "working" : "waiting" },
    { label: "Placement manifest", state: manifest ? "passed" : "waiting" },
    {
      label: "Render",
      state: renderFailed ? "failed" : visualStatus === "verified" ? "passed" : renderWorking ? "working" : "waiting",
    },
    {
      label: "Render verification",
      state: verified === "passed" ? "passed" : verified === "rejected" || verified === "incomplete" ? "failed" : renderWorking ? "working" : "waiting",
    },
  ];


  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer type-label text-foreground">SpacePlanner diagnostics</summary>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="SpacePlanner pipeline stages">
        {stages.map((stage, index) => (
          <li key={stage.label} className="flex items-center gap-2 type-body-sm">
            <StageIcon state={stage.state} />
            <span className="text-muted-foreground">{index + 1}.</span>
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid gap-2 border-t border-border pt-4 type-body-xs text-muted-foreground sm:grid-cols-2">
        <div><dt>Verified inventory units</dt><dd className="font-medium text-foreground">{inventory?.itemCount ?? 0}</dd></div>
        <div><dt>Manifest units</dt><dd className="font-medium text-foreground">{manifest?.expectedUnits ?? 0}</dd></div>
        <div><dt>Units placed</dt><dd className="font-medium text-foreground">{manifest?.placedUnits ?? 0}</dd></div>
        <div><dt>Fixed room features</dt><dd className="font-medium text-foreground">{manifest?.roomFeatures.length ?? 0}</dd></div>
        <div><dt>Packing strategy</dt><dd className="font-medium text-foreground">{manifest?.strategy ?? "—"}</dd></div>
        <div><dt>Arrangement score</dt><dd className="font-medium text-foreground">{manifest ? `${manifest.qualityScore}/100` : "—"}</dd></div>
        <div><dt>Access corridor</dt><dd className="font-medium text-foreground">{manifest?.corridorSide ?? "—"}</dd></div>
        <div><dt>Hard constraints</dt><dd className="font-medium text-foreground">{manifest ? (manifest.valid ? "all passed" : `${manifest.violations.length} failed`) : "—"}</dd></div>
        <div><dt>Render provider</dt><dd className="font-medium text-foreground">{render?.provider ?? "—"}</dd></div>
        <div><dt>Render model</dt><dd className="font-medium text-foreground">{render?.model ?? "—"}</dd></div>
        <div><dt>Render time</dt><dd className="font-medium text-foreground">{render?.renderMs ? `${(render.renderMs / 1000).toFixed(1)}s` : "—"}</dd></div>
        <div><dt>Photo prep time</dt><dd className="font-medium text-foreground">{render?.prepareMs ? `${(render.prepareMs / 1000).toFixed(1)}s` : "—"}</dd></div>
        <div><dt>Verification time</dt><dd className="font-medium text-foreground">{render?.verifyMs ? `${(render.verifyMs / 1000).toFixed(1)}s` : "—"}</dd></div>
        <div><dt>Total visualisation time</dt><dd className="font-medium text-foreground">{render?.totalMs ? `${(render.totalMs / 1000).toFixed(1)}s` : "—"}</dd></div>
        <div><dt>Diagnostic ID</dt><dd className="font-medium text-foreground">{render?.diagnosticId ?? "—"}</dd></div>
        <div><dt>Image state</dt><dd className="font-medium text-foreground">{visualStatus}</dd></div>
        <div><dt>Verification</dt><dd className="font-medium text-foreground">{verified.replace("_", " ")}</dd></div>
        <div><dt>Inventory reference</dt><dd className="break-all font-mono text-foreground">{render?.inventoryHash ?? "—"}</dd></div>
        {coverage?.supportIssues?.length ? (
          <div className="sm:col-span-2">
            <dt>Support drift (render rejected)</dt>
            <dd className="font-medium text-foreground">{coverage.supportIssues.join("; ")}</dd>
          </div>
        ) : null}
        {coverage?.featureNotes?.length ? (
          <div className="sm:col-span-2">
            <dt>Room-feature drift (not a rejection)</dt>
            <dd className="font-medium text-foreground">{coverage.featureNotes.join("; ")}</dd>
          </div>
        ) : null}


        {manifest && manifest.unplaced.length > 0 ? (
          <div className="sm:col-span-2">
            <dt>Not placed</dt>
            <dd className="font-medium text-foreground">
              {manifest.unplaced.map((entry) => `${entry.label} — ${entry.reason}`).join("; ")}
            </dd>
          </div>
        ) : null}
        {manifest ? (
          <div className="sm:col-span-2"><dt>Plan reference</dt><dd className="break-all font-mono text-foreground">{manifest.planHash || manifestHash(manifest)}</dd></div>
        ) : null}
      </dl>
    </details>
  );
}