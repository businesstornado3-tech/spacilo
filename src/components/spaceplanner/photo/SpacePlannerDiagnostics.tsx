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
} from "@/lib/spaceplanner/photo/manifest";
import {
  EMPTY_TIMINGS,
  budgetReport,
  formatMs,
  type BudgetVerdict,
  type PipelineTimings,
} from "@/lib/spaceplanner/photo/timings";
import type { ReconciliationReport } from "@/lib/spaceplanner/photo/reconcile";
import type { MergeReport } from "@/lib/vision/merge";


type StageState = "waiting" | "working" | "passed" | "failed";

function StageIcon({ state }: { state: StageState }) {
  if (state === "passed") return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (state === "failed") return <CircleAlert className="size-4 text-destructive" aria-hidden="true" />;
  if (state === "working") return <LoaderCircle className="size-4 animate-spin text-info" aria-hidden="true" />;
  return <Circle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

/** One measured stage. Unmeasured stages read "—", never "0s". */
function TimingRow({
  label,
  ms,
  verdict,
}: {
  label: string;
  ms: number | null;
  verdict?: BudgetVerdict;
}) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-medium text-foreground">
        {formatMs(ms)}
        {verdict && verdict.state !== "unknown" ? (
          <span className={verdict.state === "over" ? "ml-1 text-warning" : "ml-1 text-success"}>
            {verdict.state === "over" ? `over by ${formatMs(verdict.overBy)}` : "within target"}
          </span>
        ) : null}
      </span>
    </span>
  );
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
  reconciliation = null,
  merge = null,
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
  /** Phase 6Y — proof that nothing detected was silently dropped. */
  reconciliation?: ReconciliationReport | null;
  /** Phase 6AB — raw detections vs unique physical objects across photos. */
  merge?: MergeReport | null;
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
        <div className="sm:col-span-2 border-t border-border pt-3">
          <dt className="type-label text-foreground">Measured performance</dt>
          <dd className="mt-2 grid gap-1 sm:grid-cols-2">
            <TimingRow label="Photo preparation" ms={timings.photoPrepMs} />
            <TimingRow label="Detection" ms={timings.detectionMs} />
            <TimingRow label="Cross-photo merge" ms={timings.mergeMs} />
            <TimingRow label="Refinement" ms={timings.refineMs} />
            <TimingRow label="Completeness sweep" ms={timings.sweepMs} />
            <TimingRow label="Classification" ms={timings.classificationMs} />
            <TimingRow label="Inventory ready" ms={timings.inventoryReadyMs} verdict={budgets.belongings} />
            <TimingRow label="Space analysis" ms={timings.spaceAnalysisMs} verdict={budgets.space} />
            <TimingRow label="Deterministic plan" ms={timings.planMs} />
            <TimingRow label="Manifest validation" ms={timings.manifestValidationMs} />
            <TimingRow label="Plan ready" ms={timings.planReadyMs} verdict={budgets.plan} />
            <TimingRow label="Plan → arrangement painted" ms={timings.arrangementPaintMs} />
            <TimingRow label="Click → arrangement (wall clock)" ms={timings.timeToArrangementMs} />
            <TimingRow
              label="Click → arrangement (excluding user input)"
              ms={timings.activeTimeToArrangementMs}
              verdict={budgets.arrangement}
            />
            <TimingRow label="Render" ms={timings.renderMs} />
            <TimingRow label="Verification" ms={timings.verifyMs} />
            <TimingRow label="Total" ms={timings.totalMs} />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Vision calls</dt>
              <dd className="font-medium text-foreground">
                {timings.scanCalls === null
                  ? "—"
                  : `${timings.scanCalls} scan${timings.scanCalls === 1 ? "" : "s"}, ${timings.sweepCalls ?? 0} sweep, ${timings.refineCalls ?? 0} refine`}
              </dd>
            </div>
          </dd>
        </div>
        {reconciliation ? (
          <div className="sm:col-span-2 border-t border-border pt-3">
            <dt className="type-label text-foreground">Inventory accounting</dt>
            <dd className="mt-1 grid gap-1 sm:grid-cols-2 text-muted-foreground">
              <span className="flex justify-between gap-2">
                <span>Detected units</span>
                <span className="font-medium text-foreground">{reconciliation.detectedCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Confirmed units</span>
                <span className="font-medium text-foreground">{reconciliation.classifiedCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Placed</span>
                <span className="font-medium text-foreground">{reconciliation.manifestPlacedCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Explicitly unplaced</span>
                <span className="font-medium text-foreground">{reconciliation.manifestUnplacedCount}</span>
              </span>
              <span className="flex justify-between gap-2 sm:col-span-2">
                <span>Silently dropped</span>
                <span
                  className={
                    reconciliation.droppedCount > 0
                      ? "font-medium text-destructive"
                      : "font-medium text-success"
                  }
                >
                  {reconciliation.droppedCount}
                  {reconciliation.droppedLabels.length > 0
                    ? ` (${reconciliation.droppedLabels.join(", ")})`
                    : ""}
                </span>
              </span>
            </dd>
          </div>
        ) : null}

        {merge ? (
          <div className="sm:col-span-2 border-t border-border pt-3">
            <dt className="type-label text-foreground">Multi-photo identity</dt>
            <dd className="mt-1 grid gap-1 sm:grid-cols-2 text-muted-foreground">
              <span className="flex justify-between gap-2">
                <span>Raw detections</span>
                <span className="font-medium text-foreground">{merge.rawDetectionCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Unique physical objects</span>
                <span className="font-medium text-foreground">{merge.uniquePhysicalObjectCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Views merged</span>
                <span className="font-medium text-foreground">{merge.mergedViewCount}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>Photos</span>
                <span className="font-medium text-foreground">{merge.photoCount}</span>
              </span>
              {Object.entries(merge.objectsPerPhoto).map(([photoId, count], index) => (
                <span key={photoId} className="flex justify-between gap-2">
                  <span>Photo {index + 1} raw detections</span>
                  <span className="font-medium text-foreground">{count}</span>
                </span>
              ))}
              {merge.decisions.length > 0 ? (
                <span className="sm:col-span-2 block">
                  {merge.decisions.slice(0, 8).map((decision, index) => (
                    <span key={`${decision.identityGroupId}-${index}`} className="block">
                      {decision.kind === "merged" ? "Merged" : "Retained separately"}:{" "}
                      {decision.labels.join(" + ")} — {decision.reason}
                    </span>
                  ))}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}

        {budgets.arrangement.state === "over" ? (
          <div className="sm:col-span-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-warning">
            <dt className="type-label">Click → arrangement: OVER BUDGET</dt>
            <dd>
              {formatMs(budgets.arrangement.actualMs)} against a{" "}
              {formatMs(budgets.arrangement.budgetMs)} target — over by{" "}
              {formatMs(budgets.arrangement.overBy)}. Slowest stage:{" "}
              {budgets.bottleneck ?? "unknown"}.
            </dd>
          </div>
        ) : null}

        <div>
          <dt>Budget verdict</dt>
          <dd className="font-medium text-foreground">
            {budgets.belongings.state === "unknown" &&
            budgets.space.state === "unknown" &&
            budgets.plan.state === "unknown"
              ? "not measured yet"
              : budgets.allWithinBudget
                ? "within_budget"
                : "over_budget"}
          </dd>
        </div>
        <div>
          <dt>Slowest stage</dt>
          <dd className="font-medium text-foreground">{budgets.bottleneck ?? "—"}</dd>
        </div>

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