/**
 * Making the campaign video, in founder language.
 *
 * One primary action — "Generate video" — runs on whichever route the founder
 * picked. The four route cards show the honest state of each option: a card
 * only says READY when a real worker has checked in, and a paid route is never
 * chosen automatically or described as free.
 *
 * Nothing here ever implies a video exists. A clip is only playable once a real
 * file has been produced, measured and stored privately.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { useCampaignVideos } from "@/hooks/useMarketingVideos";
import { useVideoWorkers } from "@/hooks/useVideoWorkers";
import { buildAnimatedPlan } from "@/lib/marketing/animation";
import { founderCards, type FounderCard } from "@/lib/marketing/workers/founder-view";
import { definition } from "@/lib/marketing/platforms";
import { playerBox, versionRow } from "@/lib/marketing/review";
import type { AspectRatio, CampaignStory, PlatformAsset } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

type WorkerChoice = "AUTO" | "BROWSER" | "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD";

function statusTone(status: string): "good" | "warn" | "bad" {
  if (status === "RENDERED") return "good";
  if (status === "GENERATING") return "warn";
  return "bad";
}

function statusLabel(status: string): string {
  switch (status) {
    case "GENERATING":
      return "Making your video — usually one to three minutes";
    case "RENDERED":
      return "Ready to review";
    case "BRAND_VALIDATION_FAILED":
      return "The EarnRoom branding check did not pass";
    case "MEDIA_VALIDATION_FAILED":
      return "The finished file did not pass its checks";
    case "PROVIDER_NOT_CONFIGURED":
      return "This route needs setting up first";
    case "RENDER_FAILED":
      return "Could not be saved";
    default:
      return "This video could not be made";
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

/**
 * A compact, aspect-correct player. A portrait clip is never stretched across
 * the page: it stays the size it will actually be watched at.
 */
function CompactPlayer({
  aspect,
  src,
  className,
}: {
  aspect: AspectRatio;
  src: string;
  className?: string;
}) {
  const box = playerBox(aspect);
  return (
    <video
      controls
      preload="metadata"
      src={src}
      style={{ width: "100%", maxWidth: box.widthPx, aspectRatio: aspect.replace(":", " / ") }}
      className={cn("rounded-lg bg-secondary", className)}
    />
  );
}

function StatusChip({ card }: { card: FounderCard }) {
  const good = card.status === "READY" || card.status === "CONNECTED" || card.status === "ENABLED";
  const warn = card.status === "BUSY" || card.status === "LIMITED" || card.status === "PAUSED";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 type-body-xs font-medium",
        good && "border-success/30 bg-success-soft text-success-soft-foreground",
        warn && "border-warning/30 bg-warning-soft text-warning-soft-foreground",
        !good && !warn && "border-border bg-secondary text-muted-foreground",
      )}
    >
      {card.status.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}
    </span>
  );
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
  const workers = useVideoWorkers(true);
  const rows = videos.query.data?.videos ?? [];
  const [notice, setNotice] = React.useState<string | null>(null);
  const [support, setSupport] = React.useState<{ supported: boolean; reason: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  // "AUTO" is "choose for me", which never reaches a paid route.
  const [choice, setChoice] = React.useState<WorkerChoice>("AUTO");

  const browser = workers.browser;
  const snapshot = workers.query.data;
  const cards = React.useMemo(
    () =>
      founderCards({
        workers: snapshot?.workers ?? [],
        paidComputeEnabled: snapshot?.preferences.paidComputeEnabled ?? false,
        costLines: snapshot?.costLines ?? [],
      }),
    [snapshot],
  );
  const chosenCard =
    choice === "AUTO" ? null : (cards.find((card) => card.mode === choice) ?? null);
  const autoReady = cards.some((card) => card.mode !== "PAID_CLOUD" && card.selectable);
  const blocked =
    choice === "AUTO"
      ? autoReady
        ? null
        : "No free route is ready yet. Set up one of the options above, or enable paid cloud."
      : (chosenCard?.blockedMessage ?? null);

  // The renderer is browser-only, so it is loaded after the page is interactive.
  React.useEffect(() => {
    let cancelled = false;
    import("@/lib/marketing/animation/render.browser")
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
    setStage("Drawing the scenes");
    try {
      const { renderAnimatedPlan } = await import("@/lib/marketing/animation/render.browser");
      const { validatePlan, validateRender, qualityStatus } = await import(
        "@/lib/marketing/animation/validation"
      );
      const plan = buildAnimatedPlan({ campaignId, asset, story });
      // Check the plan before a single frame is drawn: a bad plan costs nothing.
      const planCheck = validatePlan(plan);
      if (!planCheck.passed) {
        setNotice(`This video was not made: ${planCheck.failures.join(" ")}`);
        return false;
      }
      const result = await renderAnimatedPlan(plan, {
        onProgress: (value) => {
          setProgress(value);
          setStage(value > 0.85 ? "Saving the finished video" : "Drawing the scenes");
        },
      });
      setStage("Checking the branding");
      // Check what was actually drawn, not what was intended.
      const renderCheck = validateRender(plan, result.outcome);
      const status = qualityStatus({ plan: planCheck, render: renderCheck });
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
          ? `Your video is ready — ${result.seconds.toFixed(1)} seconds, made in this browser, £0.`
          : `The file was made but did not pass its checks: ${stored.video.failureReason ?? "unknown reason"}`,
      );
      return stored.video.status === "RENDERED";
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The video could not be made.");
      return false;
    } finally {
      setBusy(null);
      setProgress(0);
      setStage(null);
    }
  };

  // Everything goes through the orchestrator: the server resolves the route,
  // and only tells this page to draw when the browser is the chosen route.
  const run = async (
    asset: PlatformAsset,
    tier: "draft" | "final",
    confirmPaid = false,
  ): Promise<boolean> => {
    try {
      setStage("Choosing where to make it");
      const result = await videos.generate.mutateAsync({
        assetId: asset.id,
        tier,
        worker: choice,
        browser,
        confirmPaid,
      });

      if (result.status === "CONFIRMATION_REQUIRED") {
        setNotice(result.detail);
        setStage(null);
        if (window.confirm(`${result.detail}\n\nGo ahead with the paid video?`)) {
          return run(asset, tier, true);
        }
        return false;
      }

      const route = result.workerLabel ? `Using ${result.workerLabel}. ` : "";
      if (result.status === "BROWSER_RENDER_REQUIRED") {
        setNotice(`${route}${result.reason ?? ""}`);
        return makeAnimation(asset);
      }
      setNotice(`${route}${result.detail}`);
      setStage(result.started ? "Making your video" : null);
      return result.started;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The video could not be started.");
      setStage(null);
      return false;
    }
  };

  const core = assets[0] ?? null;
  const coreVideo = core ? (rows.find((row) => row.assetId === core.id) ?? null) : null;
  const versions = assets.slice(1);
  const working = busy !== null || videos.generate.isPending || videos.storeAnimated.isPending;

  /** One button: make the main video, then each platform's version of it. */
  const generateEverything = async () => {
    if (!core) return;
    const ok = await run(core, "draft");
    if (!ok) return;
    for (const asset of versions) {
      setStage(`Making the ${definition(asset.platform).label} version`);
      await run(asset, "draft");
    }
    setStage(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="type-h5">Where should this video be made?</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Pick an option, or let EarnRoom choose the best free one for you. Paid video making stays
          switched off until you turn it on, and every paid video is confirmed on its own.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setChoice("AUTO")}
            aria-pressed={choice === "AUTO"}
            className={cn(
              "rounded-xl border p-3 text-left",
              choice === "AUTO" ? "border-primary bg-primary-soft" : "border-border",
            )}
          >
            <span className="type-body-sm font-semibold">Choose for me</span>
            <p className="mt-1 type-body-xs text-muted-foreground">
              EarnRoom picks the best free option that is ready. It never picks a paid one.
            </p>
            <p className="mt-2 type-body-xs text-muted-foreground">
              {autoReady ? "A free option is ready." : "No free option is ready yet."}
            </p>
          </button>

          {cards.map((card) => (
            <button
              key={card.mode}
              type="button"
              onClick={() => setChoice(card.mode)}
              aria-pressed={choice === card.mode}
              className={cn(
                "rounded-xl border p-3 text-left",
                choice === card.mode ? "border-primary bg-primary-soft" : "border-border",
                !card.selectable && "opacity-90",
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-body-sm font-semibold">{card.title}</span>
                <span className="type-body-xs text-muted-foreground">{card.badge}</span>
                <StatusChip card={card} />
              </span>
              <p className="mt-1 type-body-xs text-muted-foreground">{card.description}</p>
              <p className="mt-2 type-body-xs text-muted-foreground">{card.costLine}</p>
              {card.blockedMessage ? (
                <p className="mt-2 type-body-xs text-warning-soft-foreground">
                  {card.blockedMessage}
                </p>
              ) : card.capabilityNote ? (
                <p className="mt-2 type-body-xs text-muted-foreground">{card.capabilityNote}</p>
              ) : null}
            </button>
          ))}
        </div>
        <p className="mt-2 type-body-xs text-muted-foreground">
          Setting up “My computer”, “Free cloud” or “Paid cloud” is done in Advanced administration
          at the bottom of this page.
        </p>
      </div>

      {support && !support.supported ? (
        <Alert tone="warning" title="Animated video cannot be made in this browser">
          {support.reason}
        </Alert>
      ) : null}
      {!providerConfigured ? (
        <Alert tone="info" title="Only the free browser route is ready">
          Videos made in this browser cost nothing and work today. The other routes need setting up
          first, and no clip is ever shown as finished when it is not.
        </Alert>
      ) : null}
      {blocked ? (
        <Alert tone="warning" title="This option isn't ready yet">
          {blocked}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="info" title="Video">
          {notice}
        </Alert>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="type-h5">Your campaign video</h4>
          {core ? (
            <span className="type-body-xs text-muted-foreground">
              {core.aspect} · {core.seconds}s · {definition(core.platform).label} and versions for
              every other platform
            </span>
          ) : null}
        </div>

        {coreVideo?.playbackUrl ? (
          <CompactPlayer aspect={core?.aspect ?? "9:16"} src={coreVideo.playbackUrl} />
        ) : (
          <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center type-body-sm text-muted-foreground">
            {working
              ? `${stage ?? "Making your video"}${progress > 0 ? ` — ${Math.round(progress * 100)}%` : "…"}`
              : coreVideo
                ? statusLabel(coreVideo.status)
                : "No video made yet."}
          </div>
        )}

        {coreVideo ? (
          <p
            className={cn(
              "mt-2 type-body-xs",
              statusTone(coreVideo.status) === "good"
                ? "text-success-soft-foreground"
                : statusTone(coreVideo.status) === "warn"
                  ? "text-warning-soft-foreground"
                  : "text-destructive",
            )}
          >
            {statusLabel(coreVideo.status)}
            {coreVideo.failureReason ? ` — ${coreVideo.failureReason}` : ""}
          </p>
        ) : null}

        {coreVideo?.brandValidation?.failures?.length ? (
          <ul className="mt-1 space-y-0.5">
            {coreVideo.brandValidation.failures.map((failure) => (
              <li key={failure} className="type-body-xs text-destructive">
                {failure}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!core || working || Boolean(blocked)}
            onClick={() => void generateEverything()}
            className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {working
              ? (stage ?? "Making your video…")
              : coreVideo
                ? "Make it again"
                : "Generate video"}
          </button>
          {coreVideo && !working ? (
            <button
              type="button"
              disabled={Boolean(blocked)}
              onClick={() => core && void run(core, "final")}
              className="min-h-11 rounded-lg border border-border px-4 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-60"
            >
              Make a higher quality version
            </button>
          ) : null}
          {coreVideo &&
          !["RENDERED", "BRAND_VALIDATION_FAILED"].includes(coreVideo.status) &&
          coreVideo.queueState !== "CANCELLED" &&
          coreVideo.queueState !== "FAILED" ? (
            <button
              type="button"
              disabled={videos.cancel.isPending}
              onClick={() =>
                videos.cancel
                  .mutateAsync(coreVideo.id)
                  .then((result) => setNotice(result.detail))
                  .catch((error: Error) => setNotice(error.message))
              }
              className="min-h-11 rounded-lg border border-border px-4 type-nav text-destructive hover:bg-secondary disabled:opacity-60"
            >
              Stop making it
            </button>
          ) : null}
        </div>
      </div>

      {versions.length > 0 ? (
        <div className="rounded-xl border border-border p-4">
          <h4 className="type-h5">Platform versions</h4>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Each platform gets its own shape and length, made from the same campaign video.
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {versions.map((asset) => {
              const video = rows.find((row) => row.assetId === asset.id) ?? null;
              // The stored file is the only thing that can prove a version
              // exists, so the row is built from it — never from the plan.
              const row = versionRow(
                {
                  ...asset,
                  videoUrl: video?.playbackUrl ?? null,
                  videoStatus:
                    video?.status === "GENERATING"
                      ? "GENERATING"
                      : video?.playbackUrl
                        ? "GENERATED"
                        : video
                          ? "FAILED"
                          : "NOT_REQUESTED",
                },
                definition(asset.platform).label,
              );
              return (
                <li key={asset.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-body-sm font-semibold">{row.label}</span>
                    <span className="type-body-xs text-muted-foreground">{row.meta}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 type-body-xs font-medium",
                      row.tone === "good"
                        ? "text-success-soft-foreground"
                        : row.tone === "bad"
                          ? "text-destructive"
                          : "text-warning-soft-foreground",
                    )}
                  >
                    {row.status}
                  </p>
                  {row.hasVideo && video?.playbackUrl ? (
                    <CompactPlayer
                      aspect={asset.aspect}
                      src={video.playbackUrl}
                      className="mt-2"
                    />
                  ) : (
                    <p className="mt-1 type-body-xs text-muted-foreground">
                      {video ? statusLabel(video.status) : row.detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
