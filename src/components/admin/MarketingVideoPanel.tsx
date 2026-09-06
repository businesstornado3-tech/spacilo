/**
 * Video preview for a campaign's platform assets.
 *
 * Two routes are offered. The free animated route draws and encodes the video
 * in this browser — no video service, no GPU, no per-video charge — and the
 * server only checks and stores the finished file. The paid or self-hosted
 * generation route is unchanged and stays behind an explicit confirmation.
 *
 * Nothing here ever implies a video exists. A clip is only playable once a real
 * file has been produced, measured and stored privately.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { useCampaignVideos } from "@/hooks/useMarketingVideos";
import { buildAnimatedPlan } from "@/lib/marketing/animation";
import { definition } from "@/lib/marketing/platforms";
import type { CampaignStory, PlatformAsset } from "@/lib/marketing/types";
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
    case "MEDIA_VALIDATION_FAILED":
      return "The finished file did not pass its checks";
    case "PROVIDER_NOT_CONFIGURED":
      return "Video service requires configuration";
    case "RENDER_FAILED":
      return "Could not be saved";
    default:
      return "Generation failed";
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function MarketingVideoPanel({
  campaignId,
  assets,
  story,
  providerConfigured,
}: {
  campaignId: string;
  assets: readonly PlatformAsset[];
  story: CampaignStory;
  providerConfigured: boolean;
}) {
  const videos = useCampaignVideos(campaignId);
  const rows = videos.query.data?.videos ?? [];
  const [notice, setNotice] = React.useState<string | null>(null);
  const [support, setSupport] = React.useState<{ supported: boolean; reason: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);

  // The renderer is browser-only, so it is loaded after the page is interactive.
  React.useEffect(() => {
    let cancelled = false;
    import("@/lib/marketing/animation/render.client")
      .then((module) => {
        if (!cancelled) setSupport(module.animationSupport());
      })
      .catch(() => {
        if (!cancelled)
          setSupport({ supported: false, reason: "The animation tools could not be loaded." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const makeAnimation = async (asset: PlatformAsset) => {
    setBusy(asset.id);
    setProgress(0);
    setNotice(null);
    try {
      const { renderAnimatedPlan } = await import("@/lib/marketing/animation/render.client");
      const plan = buildAnimatedPlan({ campaignId, asset, story });
      const result = await renderAnimatedPlan(plan, { onProgress: setProgress });
      const stored = await videos.storeAnimated.mutateAsync({
        assetId: asset.id,
        platform: plan.platform,
        aspect: plan.aspect,
        seconds: result.seconds,
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
        digest: plan.digest,
        scenes: plan.scenes.length,
        brandingNotes: [...plan.branding.notes],
        mp4Base64: await toBase64(result.blob),
      });
      setNotice(
        stored.video.status === "RENDERED"
          ? `Animated video made in this browser — ${Math.round(result.bytes / 1024)} KB, ${result.seconds.toFixed(1)}s, cost £0.`
          : `The file was made but did not pass its checks: ${stored.video.failureReason ?? "unknown reason"}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The video could not be made.");
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  // A paid generation is never started from a single click: the founder is told
  // it may be charged and has to say yes before the request is repeated.
  const run = (assetId: string, tier: "draft" | "final") =>
    videos.generate
      .mutateAsync({ assetId, tier })
      .then((result) => {
        if (result.status === "CONFIRMATION_REQUIRED") {
          setNotice(result.detail);
          if (!window.confirm(`${result.detail}\n\nGo ahead with the paid generation?`)) {
            return undefined;
          }
          return videos.generate
            .mutateAsync({ assetId, tier, confirmPaid: true })
            .then((confirmed) => setNotice(confirmed.detail));
        }
        setNotice(result.detail);
        return undefined;
      })
      .catch((error: Error) => setNotice(error.message));

  return (
    <div className="space-y-3">
      {support && !support.supported ? (
        <Alert tone="warning" title="Animated video cannot be made in this browser">
          {support.reason}
        </Alert>
      ) : null}
      {!providerConfigured ? (
        <Alert tone="info" title="AI video service not connected">
          The animated route below still works and costs nothing. Generated film footage needs a
          generation route to be set up first, and no clip will ever be shown as finished when it
          is not.
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="info" title="Video">
          {notice}
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => {
          const video = rows.find((row) => row.assetId === asset.id) ?? null;
          const plan = buildAnimatedPlan({ campaignId, asset, story });
          const rendering = busy === asset.id;
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
                  {rendering
                    ? `Drawing and recording… ${Math.round(progress * 100)}%`
                    : video
                      ? statusLabel(video.status)
                      : "No video made yet"}
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
                  disabled={!support?.supported || rendering || videos.storeAnimated.isPending}
                  onClick={() => void makeAnimation(asset)}
                  className="min-h-11 rounded-lg bg-primary px-3 type-nav text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {rendering
                    ? `Making… ${Math.round(progress * 100)}%`
                    : video
                      ? "Remake animated video (free)"
                      : "Make animated video (free)"}
                </button>
                <button
                  type="button"
                  disabled={!providerConfigured || videos.generate.isPending}
                  onClick={() => run(asset.id, "draft")}
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {video ? "Regenerate draft" : "Generate draft video"}
                </button>
                <button
                  type="button"
                  disabled={!providerConfigured || videos.generate.isPending}
                  onClick={() => run(asset.id, "final")}
                  className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Generate final quality
                </button>
              </div>

              <p className="mt-2 type-body-xs text-muted-foreground">
                Animated version: {plan.scenes.length} scenes · {plan.seconds.toFixed(1)}s ·{" "}
                {plan.width}×{plan.height} · made in this browser, £0 per video.
              </p>
              {plan.branding.notes.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {plan.branding.notes.map((note) => (
                    <li key={note} className="type-body-xs text-warning-soft-foreground">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}

              {video &&
              !["RENDERED", "BRAND_VALIDATION_FAILED"].includes(video.status) &&
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
                  {video.providerKind === "FREE_ANIMATION"
                    ? "Made in your own browser — £0, no video service used"
                    : video.providerKind === "SELF_HOSTED"
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
