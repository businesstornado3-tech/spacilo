/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here. Every row is narrowed into
 * the typed shapes exported from `@/lib/marketing`.
 */
/**
 * Video generation, branding and platform connections — server side only.
 *
 * Every function re-checks `is_platform_admin(auth.uid())`. Generation is
 * provider-neutral: the default route is EarnRoom's own self-hosted worker with
 * no per-video API fee, and the paid hosted provider is used only when the
 * founder has selected it and confirmed the charge. Nothing here ever reports a
 * video as generated unless a real MP4 has been produced, probed and stored in
 * the private marketing bucket.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MarketingCampaign, PlatformAsset, PlatformId } from "@/lib/marketing/types";
import type { BrandValidationReport } from "@/lib/marketing/branding";
import type { MediaProbe } from "@/lib/marketing/media-probe";
import type { OAuthConfigState } from "@/lib/marketing/oauth";

const BUCKET = "marketing-videos";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

async function loadSettings(supabase: any): Promise<Record<string, unknown>> {
  const { defaultMarketingSettings } = await import("@/lib/marketing/platforms");
  const { data } = await supabase
    .from("marketing_settings")
    .select("settings")
    .eq("id", true)
    .maybeSingle();
  return { ...defaultMarketingSettings(), ...((data?.settings ?? {}) as object) };
}

export type MarketingVideoRow = {
  id: string;
  campaignId: string;
  assetId: string;
  platform: PlatformId;
  aspect: string;
  seconds: number;
  resolution: string;
  status: string;
  queueState: string;
  providerKind: string;
  providerModel: string | null;
  modelVersion: string | null;
  seed: number | null;
  storagePath: string | null;
  playbackUrl: string | null;
  brandValidation: BrandValidationReport | null;
  mediaProbe: MediaProbe | null;
  failureReason: string | null;
  apiCostPence: number;
  infrastructureCostPence: number | null;
  coreAssetId: string | null;
  attempt: number;
  createdAt: string;
};

async function rowToVideo(supabase: any, row: any): Promise<MarketingVideoRow> {
  let playbackUrl: string | null = null;
  if (row.storage_path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
    playbackUrl = data?.signedUrl ?? null;
  }
  return {
    id: row.id,
    campaignId: row.campaign_id,
    assetId: row.asset_id,
    platform: row.platform,
    aspect: row.aspect,
    seconds: row.seconds,
    resolution: row.resolution,
    status: row.status,
    queueState: row.queue_state ?? "QUEUED",
    providerKind: row.provider_kind ?? "SELF_HOSTED",
    providerModel: row.provider_model ?? null,
    modelVersion: row.model_version ?? null,
    seed: row.seed ?? null,
    storagePath: row.storage_path ?? null,
    playbackUrl,
    brandValidation: (row.brand_validation ?? null) as BrandValidationReport | null,
    mediaProbe: (row.media_probe ?? null) as MediaProbe | null,
    failureReason: row.failure_reason ?? null,
    apiCostPence: row.api_cost_pence ?? 0,
    infrastructureCostPence: row.infrastructure_cost_pence ?? null,
    coreAssetId: row.core_asset_id ?? null,
    attempt: row.attempt ?? 1,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------ video state */

export const getCampaignVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ campaignId: z.string().min(3).max(64) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ videos: MarketingVideoRow[] }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { data: rows } = await supabase
      .from("marketing_videos")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false });
    const videos = await Promise.all(
      ((rows ?? []) as any[]).map((row) => rowToVideo(supabase, row)),
    );
    return { videos };
  });

/* ------------------------------------------------------- provider settings */

export type VideoProviderSnapshot = {
  mode: { provider: "SELF_HOSTED" | "PAID_HOSTED"; paidProviderEnabled: boolean };
  selfHosted: {
    configured: boolean;
    status: string;
    detail: string;
    model: string;
    modelVersion: string;
    licence: { licence: string; licenceUrl: string; verifiedOn: string; commercialUse: string };
    running: number;
    queued: number;
    capacity: number;
    maxConcurrentJobs: number;
    maxJobsPerDay: number;
    infrastructurePencePerGpuMinute: number | null;
  };
  paid: { configured: boolean; detail: string; model: string | null };
  costLine: string;
};

async function providerSnapshot(supabase: any): Promise<VideoProviderSnapshot> {
  const [settings, worker, paidProvider, providers, model] = await Promise.all([
    loadSettings(supabase),
    import("@/lib/marketing/self-hosted.server"),
    import("@/lib/marketing/video.server"),
    import("@/lib/marketing/video-providers"),
    import("@/lib/marketing/video-model"),
  ]);

  const mode = providers.readProviderMode(settings);
  const config = worker.selfHostedConfig();
  const health = await worker.workerHealth();
  const paid = paidProvider.videoProviderConfiguration();
  const licence = model.licenceRecord(config.modelId)!;

  return {
    mode,
    selfHosted: {
      configured: config.configured,
      status: config.configured ? health.status : "OFFLINE",
      detail: health.detail,
      model: config.modelName,
      modelVersion: config.modelVersion,
      licence: {
        licence: licence.licence,
        licenceUrl: licence.licenceUrl,
        verifiedOn: licence.verifiedOn,
        commercialUse: licence.commercialUse,
      },
      running: health.running,
      queued: health.queued,
      capacity: health.capacity,
      maxConcurrentJobs: config.limits.maxConcurrentJobs,
      maxJobsPerDay: config.limits.maxJobsPerDay,
      infrastructurePencePerGpuMinute: config.infrastructurePencePerGpuMinute,
    },
    paid: {
      configured: paid.state === "CONFIGURED",
      detail: paid.detail,
      model: paid.model,
    },
    costLine:
      mode.provider === "SELF_HOSTED"
        ? "Video API cost: £0 per generation"
        : "Paid provider selected — each generation may be charged.",
  };
}

export const getVideoProviderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VideoProviderSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    return providerSnapshot(supabase);
  });

export const updateVideoProviderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        provider: z.enum(["SELF_HOSTED", "PAID_HOSTED"]).optional(),
        paidProviderEnabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<VideoProviderSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const settings: any = await loadSettings(supabase);

    if (data.provider) settings.videoProvider = data.provider;
    if (data.paidProviderEnabled !== undefined) {
      settings.paidVideoProviderEnabled = data.paidProviderEnabled;
    }
    // Selecting the paid provider without enabling it would be meaningless, so
    // the two are never allowed to disagree in the unsafe direction.
    if (settings.videoProvider === "PAID_HOSTED" && settings.paidVideoProviderEnabled !== true) {
      settings.videoProvider = "SELF_HOSTED";
    }

    await supabase.from("marketing_settings").upsert({ id: true, settings });
    await supabase.from("marketing_audit").insert({
      action: "video_provider_changed",
      detail: `Video generation provider set to ${settings.videoProvider}${
        settings.paidVideoProviderEnabled ? " (paid provider enabled)" : ""
      }.`,
      actor: "human",
      actor_id: context.userId,
    });
    return providerSnapshot(supabase);
  });

/* -------------------------------------------------------- video generation */

const generateSchema = z.object({
  campaignId: z.string().min(3).max(64),
  assetId: z.string().min(3).max(120),
  tier: z.enum(["draft", "final"]).default("draft"),
  /** Explicit founder confirmation that a paid generation may be charged. */
  confirmPaid: z.boolean().default(false),
});

export type GenerateVideoResult = {
  started: boolean;
  videoId: string | null;
  detail: string;
  status: string;
  /** True when the failure could be retried through the paid provider instead. */
  offerPaid: boolean;
};

export const generateCampaignVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data, context }): Promise<GenerateVideoResult> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);

    const [
      { buildVideoPrompt },
      usage,
      providers,
      worker,
      paidProvider,
      { buildBrandOverlay },
      { taglineFor },
      queue,
      workerCfg,
      modelCatalogue,
      plan,
    ] = await Promise.all([
      import("@/lib/marketing/prompt"),
      import("@/lib/marketing/usage"),
      import("@/lib/marketing/video-providers"),
      import("@/lib/marketing/self-hosted.server"),
      import("@/lib/marketing/video.server"),
      import("@/lib/marketing/branding"),
      import("@/lib/marketing/brand"),
      import("@/lib/marketing/video-queue"),
      import("@/lib/marketing/worker-config"),
      import("@/lib/marketing/video-model"),
      import("@/lib/marketing/video-plan"),
    ]);

    /* ---- which provider, if any ---- */
    const settings = await loadSettings(supabase);
    const mode = providers.readProviderMode(settings);
    const config = worker.selfHostedConfig();
    const health = config.configured
      ? await worker.workerHealth()
      : {
          status: "OFFLINE" as const,
          detail: "Self-hosted worker not configured.",
          running: 0,
          queued: 0,
        };
    const paidConfig = paidProvider.videoProviderConfiguration();

    const route = providers.routeGeneration({
      mode,
      availability: {
        selfHosted: { configured: config.configured, status: health.status, detail: health.detail },
        paid: { configured: paidConfig.state === "CONFIGURED", detail: paidConfig.detail },
      },
      confirmedPaid: data.confirmPaid,
    });
    if (!route.ok) {
      return {
        started: false,
        videoId: null,
        detail: route.detail,
        status: route.status,
        offerPaid: route.offerPaid,
      };
    }

    /* ---- campaign and asset ---- */
    const { data: campaignRow } = await supabase
      .from("marketing_campaigns")
      .select("campaign")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaignRow?.campaign) throw new Error("That campaign no longer exists.");
    const campaign = campaignRow.campaign as MarketingCampaign;
    const asset = campaign.assets.find((entry) => entry.id === data.assetId);
    if (!asset) throw new Error("That platform asset no longer exists.");

    /* ---- spend and GPU limits ---- */
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [
      { count: videosToday },
      { count: videosForCampaign },
      { count: attemptsForAsset },
      { data: activeRows },
    ] = await Promise.all([
      supabase
        .from("marketing_videos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart.toISOString()),
      supabase
        .from("marketing_videos")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId),
      supabase
        .from("marketing_videos")
        .select("id", { count: "exact", head: true })
        .eq("asset_id", data.assetId),
      supabase
        .from("marketing_videos")
        .select("queue_state")
        .in("queue_state", ["QUEUED", "GENERATING", "RENDERING", "VALIDATING"]),
    ]);

    const decision = usage.checkUsage(
      {
        videosToday: videosToday ?? 0,
        videosForCampaign: videosForCampaign ?? 0,
        attemptsForAsset: attemptsForAsset ?? 0,
      },
      usage.DEFAULT_USAGE_LIMITS,
    );
    if (!decision.allowed) {
      return {
        started: false,
        videoId: null,
        detail: decision.reason,
        status: decision.state,
        offerPaid: false,
      };
    }

    const spec = buildVideoPrompt(campaign, asset);
    const tier = workerCfg.selfHostedTier(data.tier);
    const seconds = Math.min(
      route.kind === "SELF_HOSTED" ? tier.secondsCap : 10,
      Math.max(3, spec.seconds),
    );
    const resolution =
      route.kind === "SELF_HOSTED" ? tier.resolution : data.tier === "draft" ? "360p" : "720p";

    if (route.kind === "SELF_HOSTED") {
      const active = ((activeRows ?? []) as any[]).length;
      const admission = queue.admitJob(
        {
          running: Math.max(health.running, 0),
          queued: Math.max(active - health.running, 0),
          startedToday: videosToday ?? 0,
        },
        config.limits,
        { seconds, resolution },
      );
      if (!admission.admit) {
        return {
          started: false,
          videoId: null,
          detail: admission.reason,
          status: "CAPACITY_REACHED",
          offerPaid: false,
        };
      }

      /* ---- shared core footage where platforms allow it ---- */
      const core = plan.coreAssetFor(campaign.assets, asset.id);
      let reuseJobId: string | null = null;
      if (core?.shared) {
        const { data: coreRow } = await supabase
          .from("marketing_videos")
          .select("provider_job_id, status")
          .eq("campaign_id", campaign.id)
          .eq("asset_id", core.coreAssetId)
          .eq("provider_kind", "SELF_HOSTED")
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (coreRow?.provider_job_id && coreRow.status === "RENDERED") {
          reuseJobId = coreRow.provider_job_id as string;
        }
      }

      const overlay = buildBrandOverlay({
        platform: asset.platform,
        aspect: asset.aspect,
        seconds,
        tagline: taglineFor(campaign.opportunity.key),
        cta: asset.cta,
      });
      const seed = Math.abs(
        [...`${campaign.id}:${asset.id}`].reduce(
          (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
          7,
        ),
      );

      const job = await worker.createSelfHostedJob({
        prompt: spec.prompt,
        aspect: asset.aspect,
        seconds,
        resolution,
        fps: tier.fps,
        seed,
        overlay,
        reuseJobId,
      });

      const modelRecord = modelCatalogue.videoModel(config.modelId);
      const gpuMinutes = usage.estimatedGpuMinutes({
        seconds,
        secondsPerOutputSecond: modelRecord?.hardware.secondsPerOutputSecond720p ?? 30,
        resolution,
      });
      const cost = usage.generationCost({
        provider: "SELF_HOSTED",
        resolution,
        seconds,
        infrastructurePencePerGpuMinute: config.infrastructurePencePerGpuMinute,
        gpuMinutes,
      });

      const base = {
        campaign_id: campaign.id,
        asset_id: asset.id,
        platform: asset.platform,
        aspect: asset.aspect,
        seconds,
        resolution,
        provider_kind: "SELF_HOSTED",
        provider_id: "earnroom-self-hosted-worker",
        provider_model: config.modelId,
        model_version: config.modelVersion,
        seed,
        prompt: spec.prompt,
        core_asset_id: core?.shared ? core.coreAssetId : null,
        generation_settings: { fps: tier.fps, resolution, seconds, tier: data.tier, reuseJobId },
        licence_record: modelCatalogue.licenceRecord(config.modelId),
        api_cost_pence: 0,
        infrastructure_cost_pence: cost.infrastructurePence,
        attempt: (attemptsForAsset ?? 0) + 1,
      };

      if (!job.ok) {
        await supabase.from("marketing_videos").insert({
          ...base,
          status: "VIDEO_GENERATION_FAILED",
          queue_state: "FAILED",
          failure_reason: job.reason,
        });
        await supabase.from("marketing_audit").insert({
          campaign_id: campaign.id,
          action: "video_generation_failed",
          detail: job.reason,
          actor: "engine",
          actor_id: context.userId,
        });
        return {
          started: false,
          videoId: null,
          detail: job.reason,
          status: job.status,
          offerPaid: paidConfig.state === "CONFIGURED",
        };
      }

      const { data: inserted, error } = await supabase
        .from("marketing_videos")
        .insert({
          ...base,
          provider_job_id: job.jobId,
          status: "GENERATING",
          queue_state: admission.state,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabase.from("marketing_audit").insert({
        campaign_id: campaign.id,
        action: "video_generation_started",
        detail: `Self-hosted generation for ${asset.platform} (${asset.aspect}, ${resolution}, ${config.modelId}). No video API fee.`,
        actor: "engine",
        actor_id: context.userId,
      });

      return {
        started: true,
        videoId: inserted.id as string,
        detail: `${admission.reason} Video API cost £0.`,
        status: admission.state,
        offerPaid: false,
      };
    }

    /* ---- explicitly chosen paid provider ---- */
    const job = await paidProvider.createVideoJob({
      prompt: spec.prompt,
      aspect: asset.aspect,
      seconds,
      resolution: resolution as "360p" | "720p",
    });
    const cost = usage.generationCost({ provider: "PAID_HOSTED", resolution, seconds });
    const base = {
      campaign_id: campaign.id,
      asset_id: asset.id,
      platform: asset.platform,
      aspect: asset.aspect,
      seconds,
      resolution,
      provider_kind: "PAID_HOSTED",
      provider_id: paidConfig.id,
      prompt: spec.prompt,
      generation_settings: { tier: data.tier, resolution, seconds },
      api_cost_pence: cost.apiPence,
      attempt: (attemptsForAsset ?? 0) + 1,
    };

    if (!job.ok) {
      await supabase.from("marketing_videos").insert({
        ...base,
        status:
          job.status === "PROVIDER_NOT_CONFIGURED"
            ? "PROVIDER_NOT_CONFIGURED"
            : "VIDEO_GENERATION_FAILED",
        queue_state: "FAILED",
        failure_reason: job.reason,
      });
      return {
        started: false,
        videoId: null,
        detail: job.reason,
        status: job.status,
        offerPaid: false,
      };
    }

    const { data: inserted, error } = await supabase
      .from("marketing_videos")
      .insert({
        ...base,
        provider_model: job.model,
        model_version: job.model,
        provider_job_id: job.jobId,
        status: "GENERATING",
        queue_state: "GENERATING",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("marketing_audit").insert({
      campaign_id: campaign.id,
      action: "paid_video_generation_started",
      detail: `Paid provider generation explicitly confirmed for ${asset.platform}. ${cost.apiLabel}.`,
      actor: "human",
      actor_id: context.userId,
    });

    return {
      started: true,
      videoId: inserted.id as string,
      detail: `Paid generation started. ${cost.apiLabel}.`,
      status: "GENERATING",
      offerPaid: false,
    };
  });

/**
 * Polls a generation job. On completion the file is downloaded, the real media
 * is probed, the branding is validated and only then is the video marked ready.
 */
export const pollCampaignVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ videoId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ video: MarketingVideoRow }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);

    const { data: row } = await supabase
      .from("marketing_videos")
      .select("*")
      .eq("id", data.videoId)
      .maybeSingle();
    if (!row) throw new Error("That video no longer exists.");
    if (row.status !== "GENERATING") return { video: await rowToVideo(supabase, row) };

    const [
      paidProvider,
      worker,
      { buildBrandOverlay, validateBranding },
      { taglineFor },
      { validateMedia },
    ] = await Promise.all([
      import("@/lib/marketing/video.server"),
      import("@/lib/marketing/self-hosted.server"),
      import("@/lib/marketing/branding"),
      import("@/lib/marketing/brand"),
      import("@/lib/marketing/media-probe"),
    ]);

    const selfHosted = (row.provider_kind ?? "SELF_HOSTED") === "SELF_HOSTED";
    const poll = selfHosted
      ? await worker.pollSelfHostedJob(row.provider_job_id as string)
      : await paidProvider.pollVideoJob(row.provider_job_id as string);

    const fail = async (status: string, reason: string) => {
      const { data: failed } = await supabase
        .from("marketing_videos")
        .update({ status, queue_state: "FAILED", failure_reason: reason })
        .eq("id", row.id)
        .select("*")
        .single();
      await supabase.from("marketing_audit").insert({
        campaign_id: row.campaign_id,
        action: "video_generation_failed",
        detail: reason,
        actor: "engine",
        actor_id: context.userId,
      });
      return { video: await rowToVideo(supabase, failed) };
    };

    if (!poll.ok) return fail("VIDEO_GENERATION_FAILED", poll.reason);
    if (!poll.done) {
      const state = "state" in poll && typeof poll.state === "string" ? poll.state : "GENERATING";
      const { data: updated } = await supabase
        .from("marketing_videos")
        .update({ queue_state: state })
        .eq("id", row.id)
        .select("*")
        .single();
      return { video: await rowToVideo(supabase, updated ?? row) };
    }

    /* ---- probe the real file before trusting anything about it ---- */
    await supabase.from("marketing_videos").update({ queue_state: "VALIDATING" }).eq("id", row.id);
    const media = validateMedia(poll.bytes, {
      aspect: row.aspect as "9:16" | "16:9" | "1:1",
      seconds: row.seconds,
    });
    if (!media.passed) {
      const { data: failed } = await supabase
        .from("marketing_videos")
        .update({
          status: "MEDIA_VALIDATION_FAILED",
          queue_state: "FAILED",
          media_probe: media.probe,
          failure_reason: media.failures.join(" "),
        })
        .eq("id", row.id)
        .select("*")
        .single();
      return { video: await rowToVideo(supabase, failed) };
    }

    const path = `${row.campaign_id}/${row.asset_id}-${row.id}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, poll.bytes, { contentType: poll.contentType, upsert: true });
    if (uploadError) return fail("RENDER_FAILED", uploadError.message);

    const { data: campaignRow } = await supabase
      .from("marketing_campaigns")
      .select("campaign")
      .eq("id", row.campaign_id)
      .maybeSingle();
    const campaign = campaignRow?.campaign as MarketingCampaign | undefined;
    const asset = campaign?.assets.find((entry: PlatformAsset) => entry.id === row.asset_id);

    const overlay = buildBrandOverlay({
      platform: row.platform as PlatformId,
      aspect: row.aspect,
      seconds: row.seconds,
      tagline: taglineFor(campaign?.opportunity.key ?? row.campaign_id),
      cta: asset?.cta ?? "",
    });
    const brand = validateBranding({
      overlay,
      expectedAspect: row.aspect,
      rendered: { aspect: row.aspect, seconds: media.probe.durationSeconds ?? row.seconds },
      copy: {
        title: asset?.title ?? "",
        description: asset?.description ?? "",
        caption: asset?.caption ?? "",
        cta: asset?.cta ?? "",
      },
    });

    const { data: done } = await supabase
      .from("marketing_videos")
      .update({
        status: brand.passed ? "RENDERED" : "BRAND_VALIDATION_FAILED",
        queue_state: brand.passed ? "READY" : "FAILED",
        storage_path: path,
        duration_seconds: media.probe.durationSeconds ?? row.seconds,
        media_probe: media.probe,
        brand_validation: brand,
        failure_reason: brand.passed ? null : brand.failures.join(" "),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    await supabase.from("marketing_audit").insert({
      campaign_id: row.campaign_id,
      action: brand.passed ? "video_rendered" : "brand_validation_failed",
      detail: brand.passed
        ? `Video rendered, probed (${media.probe.width}×${media.probe.height}, ${media.probe.durationSeconds?.toFixed(1)}s) and stored for ${row.platform}.`
        : brand.failures.join(" "),
      actor: "engine",
      actor_id: context.userId,
    });

    return { video: await rowToVideo(supabase, done) };
  });

/** Cancels a self-hosted job and releases the GPU. */
export const cancelCampaignVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ videoId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; detail: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { data: row } = await supabase
      .from("marketing_videos")
      .select("id, provider_kind, provider_job_id, queue_state")
      .eq("id", data.videoId)
      .maybeSingle();
    if (!row) throw new Error("That video no longer exists.");

    const { isTerminal } = await import("@/lib/marketing/video-queue");
    if (isTerminal(row.queue_state)) {
      return { ok: false, detail: "That generation has already finished." };
    }

    let detail = "Generation cancelled.";
    if ((row.provider_kind ?? "SELF_HOSTED") === "SELF_HOSTED" && row.provider_job_id) {
      const { cancelSelfHostedJob } = await import("@/lib/marketing/self-hosted.server");
      detail = (await cancelSelfHostedJob(row.provider_job_id)).detail;
    }
    await supabase
      .from("marketing_videos")
      .update({
        queue_state: "CANCELLED",
        status: "VIDEO_GENERATION_FAILED",
        failure_reason: detail,
      })
      .eq("id", row.id);
    await supabase.from("marketing_audit").insert({
      campaign_id: row.campaign_id,
      action: "video_generation_cancelled",
      detail,
      actor: "human",
      actor_id: context.userId,
    });
    return { ok: true, detail };
  });

/* --------------------------------------------------- platform connections */

export type PublishingConnectionsSnapshot = {
  provider: {
    id: string;
    name: string;
    state: string;
    detail: string;
    model: string | null;
    resolutions: readonly string[];
  };
  video: VideoProviderSnapshot;
  platforms: (OAuthConfigState & {
    label: string;
    connection: string;
    statusLabel: string;
    mode: string;
    paused: boolean;
    accountLabel: string | null;
    lastError: string | null;
    autonomousAvailable: boolean;
  })[];
};

export const getPublishingConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublishingConnectionsSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);

    const [{ allCapabilities }, { oauthConfigState, OAUTH_DEFINITIONS }, provider, video] =
      await Promise.all([
        import("@/lib/marketing/platforms"),
        import("@/lib/marketing/oauth"),
        import("@/lib/marketing/video.server"),
        providerSnapshot(supabase),
      ]);

    const settings = await loadSettings(supabase);

    const { data: connectionRows } = await supabase
      .from("marketing_platform_connections")
      .select("platform, connection, scopes, expires_at, last_error, account_label");
    const connections = ((connectionRows ?? []) as any[]).map((row) => ({
      platform: row.platform as PlatformId,
      connection: row.connection,
      scopes: row.scopes ?? [],
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
      lastError: row.last_error ?? null,
    }));

    // Secret NAMES only — no value is ever read, logged or returned.
    const configuredSecrets = [
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
      "META_APP_ID",
      "META_APP_SECRET",
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_CLIENT_SECRET",
      "LINKEDIN_CLIENT_ID",
      "LINKEDIN_CLIENT_SECRET",
      "PINTEREST_APP_ID",
      "PINTEREST_APP_SECRET",
    ].filter((name) => Boolean(process.env[name]));

    const capabilities = allCapabilities(connections, settings as any, Date.now());

    return {
      provider: provider.videoProviderConfiguration(),
      video,
      platforms: OAUTH_DEFINITIONS.map((def) => {
        const capability = capabilities.find((entry) => entry.platform === def.platform)!;
        const record = ((connectionRows ?? []) as any[]).find(
          (entry) => entry.platform === def.platform,
        );
        return {
          ...oauthConfigState(def.platform, configuredSecrets),
          label: def.label,
          connection: capability.connection,
          statusLabel: capability.statusLabel,
          mode: capability.mode,
          paused: capability.paused,
          accountLabel: record?.account_label ?? null,
          lastError: record?.last_error ?? null,
          autonomousAvailable: capability.autonomousAvailable,
        };
      }),
    };
  });

/**
 * Begins an official OAuth connection. EarnRoom never asks for a platform
 * password: this returns the platform's own authorisation URL, and only when
 * the application credentials actually exist server-side.
 */
export const startPlatformConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ platform: z.string().min(3).max(40) }).parse(data))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; url: string | null; detail: string }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { oauthConfigState, oauthDefinition, authorizeUrl } =
        await import("@/lib/marketing/oauth");
      const platform = data.platform as PlatformId;
      const def = oauthDefinition(platform);

      const clientId = process.env[def.clientIdSecret];
      const state = oauthConfigState(
        platform,
        [def.clientIdSecret, def.clientSecretSecret].filter((name) => Boolean(process.env[name])),
      );
      if (!state.configured || !clientId) {
        return {
          ok: false,
          url: null,
          detail: `Requires configuration: ${state.missingSecrets.join(" and ")} must be set up before ${def.label} can be connected. Register the app at ${def.developerConsole}.`,
        };
      }

      const redirectUri = `${process.env["PUBLIC_SITE_URL"] ?? "https://earnroom.co.uk"}/api/public/marketing/oauth/${platform}`;
      return {
        ok: true,
        url: authorizeUrl({ platform, clientId, redirectUri, state: context.userId }),
        detail: `Complete sign-in, two-factor authentication and permissions on ${def.label} itself.`,
      };
    },
  );

export const disconnectPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ platform: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    await supabase.from("marketing_platform_connections").delete().eq("platform", data.platform);
    await supabase.from("marketing_audit").insert({
      action: "platform_disconnected",
      detail: `${data.platform} disconnected by the founder.`,
      actor: "human",
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Verifies a stored connection without publishing anything. */
export const testPlatformConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ platform: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; detail: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { data: row } = await supabase
      .from("marketing_platform_connections")
      .select("platform, connection, scopes, expires_at, account_id")
      .eq("platform", data.platform)
      .maybeSingle();

    if (!row) {
      return { ok: false, detail: "Not connected — no stored authorisation for this platform." };
    }
    const { oauthDefinition } = await import("@/lib/marketing/oauth");
    const def = oauthDefinition(data.platform as PlatformId);
    const expired = row.expires_at && Date.parse(row.expires_at) <= Date.now();
    const missingScopes = def.scopes.filter((scope) => !(row.scopes ?? []).includes(scope));

    const detail = expired
      ? "The stored authorisation has expired. Reconnect the account."
      : missingScopes.length
        ? `Connected, but these permissions are missing: ${missingScopes.join(", ")}.`
        : !row.account_id
          ? "Connected, but no destination channel, page or board has been selected."
          : "Connection valid, permissions granted and a destination account is selected.";

    await supabase
      .from("marketing_platform_connections")
      .update({ last_checked_at: new Date().toISOString(), last_error: expired ? detail : null })
      .eq("platform", data.platform);

    return { ok: !expired && missingScopes.length === 0 && Boolean(row.account_id), detail };
  });

/** Per-platform publishing mode and pause controls. */
export const updatePlatformPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        platform: z.string().min(3).max(40),
        mode: z.enum(["DRAFT", "APPROVAL_REQUIRED", "AUTONOMOUS"]).optional(),
        paused: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const settings: any = await loadSettings(supabase);

    if (data.mode)
      settings.platformModes = { ...settings.platformModes, [data.platform]: data.mode };
    if (data.paused !== undefined) {
      const paused = new Set<string>(settings.pausedPlatforms ?? []);
      if (data.paused) paused.add(data.platform);
      else paused.delete(data.platform);
      settings.pausedPlatforms = [...paused];
    }

    await supabase.from("marketing_settings").upsert({ id: true, settings });
    await supabase.from("marketing_audit").insert({
      action:
        data.paused === undefined ? "publishing_mode_changed" : data.paused ? "paused" : "resumed",
      detail: `${data.platform}: ${data.mode ?? (data.paused ? "publishing paused" : "publishing resumed")}.`,
      actor: "human",
      actor_id: context.userId,
    });
    return { ok: true };
  });

/* ------------------------------------------------- free animated engine */

/**
 * Stores a video the founder's own browser drew and encoded.
 *
 * There is no video API and no GPU behind this: the file arrives already made,
 * at no per-video cost. It is still probed and brand-checked exactly like a
 * provider-generated file — a video is only ever marked ready when a real,
 * playable MP4 has been stored.
 */
export const storeAnimatedVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        campaignId: z.string().min(3).max(64),
        assetId: z.string().min(1).max(120),
        platform: z.string().min(2).max(40),
        aspect: z.enum(["9:16", "16:9", "1:1"]),
        seconds: z.number().min(1).max(200),
        width: z.number().int().min(160).max(4096),
        height: z.number().int().min(160).max(4096),
        fps: z.number().int().min(8).max(60),
        digest: z.string().min(4).max(64),
        scenes: z.number().int().min(1).max(40),
        brandingNotes: z.array(z.string().max(400)).max(10).default([]),
        /** Base64 MP4 produced locally. Capped so a request cannot be abused. */
        mp4Base64: z.string().min(100).max(40_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ video: MarketingVideoRow }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);

    const [{ validateMedia }, { buildBrandOverlay, validateBranding }, { taglineFor }] =
      await Promise.all([
        import("@/lib/marketing/media-probe"),
        import("@/lib/marketing/branding"),
        import("@/lib/marketing/brand"),
      ]);

    const binary = Buffer.from(data.mp4Base64, "base64");
    const bytes = binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ) as ArrayBuffer;

    const media = validateMedia(bytes, {
      aspect: data.aspect,
      seconds: data.seconds,
      toleranceSeconds: 1.5,
    });

    const { data: campaignRow } = await supabase
      .from("marketing_campaigns")
      .select("campaign")
      .eq("id", data.campaignId)
      .maybeSingle();
    const campaign = campaignRow?.campaign as MarketingCampaign | undefined;
    const asset = campaign?.assets.find((entry: PlatformAsset) => entry.id === data.assetId);

    const baseRow = {
      campaign_id: data.campaignId,
      asset_id: data.assetId,
      platform: data.platform,
      aspect: data.aspect,
      seconds: Math.round(data.seconds),
      resolution: `${data.width}x${data.height}`,
      provider_kind: "FREE_ANIMATION",
      provider_id: "earnroom-animation",
      provider_model: "earnroom-vector-animation",
      model_version: `plan-${data.digest}`,
      queue_state: "READY",
      api_cost_pence: 0,
      infrastructure_cost_pence: 0,
      attempt: 1,
      generation_settings: {
        engine: "FREE_ANIMATION",
        renderedIn: "founder-browser",
        fps: data.fps,
        scenes: data.scenes,
        planDigest: data.digest,
        brandingNotes: data.brandingNotes,
      },
      media_probe: media.probe,
      prompt: asset?.hook ?? null,
    };

    if (!media.passed) {
      const { data: failed } = await supabase
        .from("marketing_videos")
        .insert({
          ...baseRow,
          status: "MEDIA_VALIDATION_FAILED",
          queue_state: "FAILED",
          failure_reason: media.failures.join(" "),
        })
        .select("*")
        .single();
      await supabase.from("marketing_audit").insert({
        campaign_id: data.campaignId,
        action: "video_generation_failed",
        detail: `Animated video rejected before storing: ${media.failures.join(" ")}`,
        actor: "engine",
        actor_id: context.userId,
      });
      return { video: await rowToVideo(supabase, failed) };
    }

    const path = `${data.campaignId}/${data.assetId}-animated-${data.digest}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(`The video could not be saved: ${uploadError.message}`);

    const overlay = buildBrandOverlay({
      platform: data.platform as PlatformId,
      aspect: data.aspect,
      seconds: Math.round(data.seconds),
      tagline: taglineFor(campaign?.opportunity.key ?? data.campaignId),
      cta: asset?.cta ?? "",
    });
    const brand = validateBranding({
      overlay,
      expectedAspect: data.aspect,
      rendered: { aspect: data.aspect, seconds: media.probe.durationSeconds ?? data.seconds },
      copy: {
        title: asset?.title ?? "",
        description: asset?.description ?? "",
        caption: asset?.caption ?? "",
        cta: asset?.cta ?? "",
      },
    });

    const { data: stored } = await supabase
      .from("marketing_videos")
      .insert({
        ...baseRow,
        status: brand.passed ? "RENDERED" : "BRAND_VALIDATION_FAILED",
        queue_state: brand.passed ? "READY" : "FAILED",
        storage_path: path,
        duration_seconds: media.probe.durationSeconds ?? data.seconds,
        brand_validation: brand,
        failure_reason: brand.passed ? null : brand.failures.join(" "),
      })
      .select("*")
      .single();

    await supabase.from("marketing_audit").insert({
      campaign_id: data.campaignId,
      action: brand.passed ? "video_rendered" : "brand_validation_failed",
      detail: brand.passed
        ? `Animated video made locally at no cost (${media.probe.width}×${media.probe.height}, ${media.probe.durationSeconds?.toFixed(1)}s) and stored for ${data.platform}.`
        : brand.failures.join(" "),
      actor: "human",
      actor_id: context.userId,
    });

    return { video: await rowToVideo(supabase, stored) };
  });
