/**
 * Approve, reject and publish — the founder's decision on today's campaign.
 *
 * Every state here comes from what is stored, so a refresh shows the same
 * answer. Nothing is described as ready to publish unless a video exists, the
 * campaign is approved, publishing is on, and that account is connected.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import {
  decisionView,
  publicationReadiness,
  type PlatformReadiness,
} from "@/lib/marketing/review";
import type {
  MarketingCampaign,
  MarketingSettings,
  PlatformCapability,
  PublicationRecord,
} from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

export type DecisionState = {
  status: string;
  approvedAt: string | null;
  decidedAt: string | null;
  note: string | null;
} | null;

function ReadinessRow({ row }: { row: PlatformReadiness }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body-sm font-semibold">{row.label}</span>
        <span
          className={cn(
            "type-body-xs font-medium",
            row.ready ? "text-success-soft-foreground" : "text-warning-soft-foreground",
          )}
        >
          {row.ready ? "Ready to publish" : "Not ready"}
        </span>
      </div>
      {row.blockers.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {row.blockers.map((blocker) => (
            <li key={blocker} className="type-body-xs text-muted-foreground">
              • {blocker}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 type-body-xs text-muted-foreground">{row.summary}</p>
      )}
    </li>
  );
}

export function CampaignDecision({
  campaign,
  decision,
  settings,
  capabilities,
  publications,
  deciding,
  publishing,
  onDecide,
  onPublish,
  publishResults,
  error,
}: {
  campaign: MarketingCampaign;
  decision: DecisionState;
  settings: MarketingSettings;
  capabilities: readonly PlatformCapability[];
  publications: readonly PublicationRecord[];
  deciding: boolean;
  publishing: boolean;
  onDecide: (input: { decision: "APPROVE" | "REJECT"; note?: string }) => void;
  onPublish: () => void;
  publishResults: { platform: string; state: string; detail: string }[] | null;
  error: string | null;
}) {
  const [showReject, setShowReject] = React.useState(false);
  const [note, setNote] = React.useState("");

  const videosTotal = campaign.assets.length;
  const videosReady = campaign.assets.filter((asset) => asset.videoUrl !== null).length;
  const status = decision?.status ?? campaign.status;

  const view = decisionView({
    status,
    validationPassed: campaign.validation.passed,
    approvedAt: decision?.approvedAt ?? null,
    decidedAt: decision?.decidedAt ?? null,
    note: decision?.note ?? null,
    videosReady,
    videosTotal,
    publishingPaused: settings.pauseAllPublishing,
  });

  const readiness = publicationReadiness({
    campaignStatus: status,
    settings,
    capabilities,
    assets: campaign.assets,
    publications: publications.filter((entry) => entry.campaignId === campaign.id),
  });

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-xl border p-4",
          view.tone === "good"
            ? "border-success/30 bg-success-soft"
            : view.tone === "bad"
              ? "border-destructive/30 bg-destructive/5"
              : "border-border",
        )}
      >
        <h4 className="type-h5">{view.headline}</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">{view.detail}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDecide({ decision: "APPROVE" })}
            disabled={!view.canApprove || deciding}
            title={view.approveBlockedReason ?? undefined}
            className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground disabled:opacity-60"
          >
            {deciding ? "Saving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setShowReject((open) => !open)}
            disabled={!view.canReject || deciding}
            className="min-h-11 rounded-lg border border-border px-4 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={!view.canPublish || publishing}
            title={view.publishBlockedReason ?? undefined}
            className="min-h-11 rounded-lg border border-border px-4 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
          >
            {publishing ? "Trying…" : "Attempt publication"}
          </button>
        </div>

        {view.approveBlockedReason ? (
          <p className="mt-2 type-body-xs text-warning-soft-foreground">
            {view.approveBlockedReason}
          </p>
        ) : null}
        {view.publishBlockedReason && !view.canPublish ? (
          <p className="mt-1 type-body-xs text-warning-soft-foreground">
            {view.publishBlockedReason}
          </p>
        ) : null}

        {showReject ? (
          <div className="mt-3 rounded-lg border border-border p-3">
            <label className="type-body-xs">
              Why are you rejecting it? (kept with the campaign)
              <textarea
                value={note}
                maxLength={500}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 type-body-sm"
                placeholder="Wrong town, tone is off, wait for more spaces…"
              />
            </label>
            <button
              type="button"
              disabled={deciding}
              onClick={() => {
                onDecide({ decision: "REJECT", note: note.trim() || undefined });
                setShowReject(false);
                setNote("");
              }}
              className="mt-2 min-h-10 rounded-lg border border-border px-3 type-body-sm text-destructive hover:bg-secondary disabled:opacity-60"
            >
              Confirm rejection
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert tone="error" title="That didn't save">
          {error}
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        <h4 className="type-h5">Can this be published?</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Checked for each account separately. EarnRoom never records a post it did not really
          make.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {readiness.map((row) => (
            <ReadinessRow key={row.platform} row={row} />
          ))}
        </ul>
      </div>

      {publishResults ? (
        <Alert tone="info" title="What happened when EarnRoom tried">
          <ul className="space-y-1">
            {publishResults.map((result) => (
              <li key={result.platform}>
                {result.platform}: {result.state.replace(/_/g, " ").toLowerCase()} —{" "}
                {result.detail}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
