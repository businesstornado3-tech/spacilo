/**
 * Video preview for a campaign's platform assets.
 *
 * Nothing here ever implies a video exists. A clip is only playable once the
 * generation service has finished and the file has been stored privately.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { useCampaignVideos } from "@/hooks/useMarketingVideos";
import { definition } from "@/lib/marketing/platforms";
import type { PlatformAsset } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

function statusTone(status: string): "good" | "warn" | "bad" {
  if (status === "RENDERED") return "good";
  if (status === "GENERATING") return "warn";
  return "bad";
}

function statusLabel(status: string): string {
  switch (status) {
    case "GENERATING":
      return "Generating — usually one to three minutes";
    case "RENDERED":
      return "Ready to review";
    case "BRAND_VALIDATION_FAILED":
      return "Branding check failed";
    case "PROVIDER_NOT_CONFIGURED":
      return "Video service requires configuration";
    case "RENDER_FAILED":
      return "Could not be saved";
    default:
      return "Generation failed";
  }
}

export function MarketingVideoPanel({
  campaignId,
  assets,
  providerConfigured,
}: {
  campaignId: string;
  assets: readonly PlatformAsset[];
  providerConfigured: boolean;
}) {
  const videos = useCampaignVideos(campaignId);
  const rows = videos.query.data?.videos ?? [];
  const [notice, setNotice] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      {!providerConfigured ? (
        <Alert tone="warning" title="Video generation not ready">
          Videos cannot be produced until a generation route is available. Everything else — the
          idea, the words and the platform plan — is ready, and no clip will ever be shown as
          finished when it is not.
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="info" title="Video generation">
          {notice}
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => {
          const video = rows.find((row) => row.assetId === asset.id) ?? null;
          return (
            <li key={asset.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-body-sm font-semibold">
                  {definition(asset.platform).label}
                </span>
                <span className="type-body-xs text-muted-foreground">
                  {asset.aspect} · {asset.seconds}s
                </span>
              </div>

              {video?.playbackUrl ? (
                <video
                  controls
                  preload="metadata"
                  src={video.playbackUrl}
                  className="mt-2 w-full rounded-lg bg-secondary"
                />
              ) : (
                <div className="mt-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-border type-body-xs text-muted-foreground">
                  {video ? statusLabel(video.status) : "No video generated yet"}
                </div>
              )}

              {video ? (
                <p
                  className={cn(
                    "mt-2 type-body-xs",
                    statusTone(video.status) === "good"
                      ? "text-success-soft-foreground"
                      : statusTone(video.status) === "warn"
                        ? "text-warning-soft-foreground"
                        : "text-destructive",
                  )}
                >
                  {statusLabel(video.status)}
                  {video.failureReason ? ` — ${video.failureReason}` : ""}
                </p>
              ) : null}

              {video?.brandValidation?.failures?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {video.brandValidation.failures.map((failure) => (
                    <li key={failure} className="type-body-xs text-destructive">
                      {failure}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!providerConfigured || videos.generate.isPending}
                  onClick={() =>
                    videos.generate
                      .mutateAsync({ assetId: asset.id, tier: "draft" })
                      .then((result) => setNotice(result.detail))
                      .catch((error: Error) => setNotice(error.message))
                  }
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {video ? "Regenerate draft" : "Generate draft video"}
                </button>
                <button
                  type="button"
                  disabled={!providerConfigured || videos.generate.isPending}
                  onClick={() =>
                    videos.generate
                      .mutateAsync({ assetId: asset.id, tier: "final" })
                      .then((result) => setNotice(result.detail))
                      .catch((error: Error) => setNotice(error.message))
                  }
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Generate final quality
                </button>
              </div>

              {video && !["RENDERED", "BRAND_VALIDATION_FAILED"].includes(video.status) &&
              video.queueState !== "CANCELLED" &&
              video.queueState !== "FAILED" ? (
                <button
                  type="button"
                  disabled={videos.cancel.isPending}
                  onClick={() =>
                    videos.cancel
                      .mutateAsync(video.id)
                      .then((result) => setNotice(result.detail))
                      .catch((error: Error) => setNotice(error.message))
                  }
                  className="mt-2 min-h-11 rounded-lg border border-border px-3 type-nav text-destructive hover:bg-secondary disabled:opacity-60"
                >
                  Cancel generation
                </button>
              ) : null}

              {video ? (
                <p className="mt-2 type-body-xs text-muted-foreground">
                  {video.providerKind === "SELF_HOSTED"
                    ? `Made on EarnRoom's own worker — video cost £0${
                        video.infrastructureCostPence !== null
                          ? ` (about £${(video.infrastructureCostPence / 100).toFixed(2)} of computing time)`
                          : ""
                      }`
                    : `Paid service — about £${(video.apiCostPence / 100).toFixed(2)}`}{" "}
                  · attempt {video.attempt}
                  {video.coreAssetId ? " · reuses this campaign's core film" : ""}
                </p>
              ) : null}

            </li>
          );
        })}
      </ul>
    </div>
  );
}
