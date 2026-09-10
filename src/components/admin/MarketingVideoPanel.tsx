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
import { ComputerSetup } from "@/components/admin/ComputerSetup";
import {
  generateButtonLabel,
  generationSummary,
  simpleModeCards,
  validateModeSelection,
} from "@/lib/marketing/workers/mode-panel";
import { estimatedCostPence } from "@/lib/marketing/usage";
import { definition } from "@/lib/marketing/platforms";
import { playerBox, versionRow } from "@/lib/marketing/review";
import type {
  AspectRatio,
  CampaignStory,
  MarketingAudience,
  PlatformAsset,
} from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

type WorkerChoice = "BROWSER" | "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD" | null;

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

export function MarketingVideoPanel({
  campaignId,
  assets,
  story,
  providerConfigured,
  audience = null,
  topic = null,
}: {
  campaignId: string;
  assets: readonly PlatformAsset[];
  story: CampaignStory;
  providerConfigured: boolean;
  /** From the existing campaign intelligence; used to cast the story. */
  audience?: MarketingAudience | null;
  topic?: string | null;
}) {
  const videos = useCampaignVideos(campaignId);
  const workers = useVideoWorkers(true);
  const rows = videos.query.data?.videos ?? [];
  const [notice, setNotice] = React.useState<string | null>(null);
  const [support, setSupport] = React.useState<{ supported: boolean; reason: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  // Exactly one mode is ever active. Nothing is chosen for the founder, and a
  // free choice is never promoted to a paid one.
  const [choice, setChoice] = React.useState<WorkerChoice>(null);
  const [showSetup, setShowSetup] = React.useState(false);
  const setupRef = React.useRef<HTMLDivElement | null>(null);

  const browser = workers.browser;
  const snapshot = workers.query.data;
  const paidEnabled = snapshot?.preferences.paidComputeEnabled ?? false;
  const modeCards = React.useMemo(
    () =>
      simpleModeCards({
        workers: snapshot?.workers ?? [],
        paidComputeEnabled: paidEnabled,
        selected: choice,
        browserSupported: support ? support.supported : null,
        paidProviderConfigured: snapshot?.paidProviderConfigured ?? false,
        installerAvailable: snapshot?.installerAvailable ?? false,
      }),
    [snapshot, paidEnabled, choice, support],
  );
  const selection = validateModeSelection(modeCards, choice);
  // The estimate covers the whole run — the campaign video and every platform
  // version — so the Generate button carries the real number.
  const estimatedPence = React.useMemo(() => {
    let total = 0;
    for (const asset of assets) {
      const pence = estimatedCostPence("720p", asset.seconds);
      if (pence === null) return null;
      total += pence;
    }
    return total;
  }, [assets]);
  const summary = generationSummary({
    cards: modeCards,
    selected: choice,
    paidComputeEnabled: paidEnabled,
    estimatedPence,
  });
  const blocked = selection.ok ? null : selection.message;
  const dailyLimit = snapshot?.preferences.usage.maxVideosPerDay ?? null;
  const [limitDraft, setLimitDraft] = React.useState<string>("");
  React.useEffect(() => {
    if (dailyLimit !== null) setLimitDraft(String(dailyLimit));
  }, [dailyLimit]);

  /** The one Paid Cloud switch. Enabling also selects the mode; nothing runs. */
  const togglePaid = (next: boolean) => {
    workers.preferences
      .mutateAsync({ paidComputeEnabled: next })
      .then(() => {
        setChoice((current) => {
          if (next) return "PAID_CLOUD";
          return current === "PAID_CLOUD" ? null : current;
        });
        setNotice(
          next
            ? "Paid Cloud is on. Nothing has been generated or charged — pressing Generate Paid Video starts a paid generation."
            : "Paid Cloud is off. No paid video can be made.",
        );
      })
      .catch((error: Error) => setNotice(error.message));
  };

  const saveDailyLimit = () => {
    const value = Number(limitDraft);
    if (!Number.isFinite(value) || value < 1 || value > 50) {
      setNotice("Choose a daily video limit between 1 and 50.");
      return;
    }
    workers.preferences
      .mutateAsync({ usage: { maxVideosPerDay: Math.round(value) } })
      .then(() => setNotice(`Daily video limit is now ${Math.round(value)} videos a day.`))
      .catch((error: Error) => setNotice(error.message));
  };

  // Pick the first available free mode once, so the page is usable straight
  // away — never a paid one, and never after the founder has chosen.
  React.useEffect(() => {
    if (choice !== null) return;
    const firstFree = modeCards.find((card) => card.mode !== "PAID_CLOUD" && card.available);
    if (firstFree) setChoice(firstFree.mode);
  }, [choice, modeCards]);

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
      const { validatePlan, validateRender, qualityStatus } =
        await import("@/lib/marketing/animation/validation");
      const plan = buildAnimatedPlan({ campaignId, asset, story, audience, topic });
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
        qualityStatus: status,
        qualityFailures: renderCheck.failures,
        mp4Base64: await toBase64(result.blob),
      });
      setNotice(
        stored.video.status === "RENDERED"
          ? `Your video is ready — ${result.seconds.toFixed(1)} seconds, made in this browser, £0. Quality check: production ready.`
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
  const run = async (asset: PlatformAsset, tier: "draft" | "final"): Promise<boolean> => {
    // The chosen mode must be genuinely available; nothing is switched
    // silently, and no generation starts on an unavailable route.
    const gate = validateModeSelection(modeCards, choice);
    if (!gate.ok || choice === null) {
      setNotice(gate.message ?? "Choose a video generation mode first.");
      return false;
    }
    // Paid Cloud has one switch. It is on, the founder chose it, and pressing
    // Generate Paid Video is the confirmation — there is no second dialog.
    const confirmPaid = choice === "PAID_CLOUD" && paidEnabled;
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
        // Only reachable when Paid Cloud is off: nothing paid may start.
        setNotice("Paid Cloud is switched off, so no paid video can be made.");
        setStage(null);
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
        <h4 className="type-h5">Video generation mode</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Choose how this video is made. Paid Cloud stays switched off until you enable it, and
          every paid video is still confirmed on its own.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {modeCards.map((card) => (
            <div
              key={card.mode}
              className={cn(
                "rounded-xl border p-3",
                card.selected ? "border-primary bg-primary-soft" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-body-sm font-semibold">
                  {card.selected ? "✓ " : ""}
                  {card.title}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 type-body-xs font-medium",
                    card.status === "ACTIVE"
                      ? "border-success/30 bg-success-soft text-success-soft-foreground"
                      : card.available
                        ? "border-border bg-secondary text-muted-foreground"
                        : "border-border bg-secondary text-muted-foreground",
                  )}
                >
                  {card.status}
                </span>
              </div>
              <p className="mt-1 type-body-xs text-muted-foreground">{card.description}</p>
              <p className="mt-1 type-body-xs text-muted-foreground">{card.costLine}</p>
              {card.limitation ? (
                <p className="mt-1 type-body-xs text-muted-foreground">{card.limitation}</p>
              ) : null}
              {card.statusNote ? (
                <p className="mt-1 type-body-xs text-muted-foreground">{card.statusNote}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {card.action === "SELECT" ? (
                  <button
                    type="button"
                    aria-pressed={card.selected}
                    onClick={() => setChoice(card.mode)}
                    className="min-h-9 rounded-lg border border-border px-3 type-body-xs font-medium hover:bg-secondary"
                  >
                    {card.actionLabel}
                  </button>
                ) : null}
                {card.action === "INSTALL" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSetup(true);
                      // Otherwise the panel opens below the fold and the
                      // button looks like it did nothing.
                      window.setTimeout(
                        () => setupRef.current?.scrollIntoView({ block: "center" }),
                        0,
                      );
                    }}
                    className="min-h-9 rounded-lg bg-primary px-3 type-body-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {card.actionLabel}
                  </button>
                ) : null}
                {card.action === "START" ? (
                  <button
                    type="button"
                    onClick={() => void workers.query.refetch()}
                    className="min-h-9 rounded-lg border border-border px-3 type-body-xs font-medium hover:bg-secondary"
                  >
                    {card.actionLabel}
                  </button>
                ) : null}
                {card.mode === "PAID_CLOUD" ? (
                  <button
                    type="button"
                    disabled={workers.preferences.isPending}
                    onClick={() => {
                      // Enabling only authorises the route. It never starts a
                      // generation and never spends anything by itself.
                      const next = !paidEnabled;
                      if (next && !window.confirm(PAID_ENABLE_CONFIRMATION)) return;
                      if (!next && choice === "PAID_CLOUD") setChoice(null);
                      workers.preferences
                        .mutateAsync({ paidComputeEnabled: next })
                        .then(() =>
                          setNotice(
                            next
                              ? "Paid Cloud is enabled. Nothing has been generated and nothing has been charged — each paid video is still confirmed separately."
                              : "Paid Cloud is disabled. No paid generation can be requested.",
                          ),
                        )
                        .catch((error: Error) => setNotice(error.message));
                    }}
                    className="min-h-9 rounded-lg border border-border px-3 type-body-xs font-medium hover:bg-secondary disabled:opacity-60"
                  >
                    {paidEnabled ? "Disable Paid Cloud" : "Enable Paid Cloud"}
                  </button>
                ) : null}
              </div>
              {card.blockedMessage ? (
                <p className="mt-2 type-body-xs text-warning-soft-foreground">
                  {card.blockedMessage}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {showSetup ? (
          <div ref={setupRef} className="mt-3 rounded-xl border border-border p-3">
            <ComputerSetup onConnected={() => void workers.query.refetch()} />
          </div>
        ) : null}
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

        <div className="mt-3 rounded-lg bg-secondary px-3 py-2">
          <p className="type-body-xs font-medium">{summary.modeLine}</p>
          {summary.paidLine ? (
            <p className="type-body-xs text-muted-foreground">{summary.paidLine}</p>
          ) : null}
          <p className="type-body-xs text-muted-foreground">{summary.costLine}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!core || working || Boolean(blocked)}
            onClick={() => void generateEverything()}
            className="min-h-11 rounded-lg bg-primary px-4 type-nav font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {working ? (stage ?? "Making your video…") : generateButtonLabel(choice)}
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
                    <CompactPlayer aspect={asset.aspect} src={video.playbackUrl} className="mt-2" />
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
