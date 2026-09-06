/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here. Every row is narrowed into
 * the typed shapes exported from `@/lib/marketing`.
 */
/**
 * Video generation, branding and platform connections — server side only.
 *
 * Every function re-checks `is_platform_admin(auth.uid())`. Nothing here ever
 * reports a video as generated unless a real file has been produced by the
 * configured provider and stored in the private marketing bucket, and nothing
 * reports a platform as connected unless a real connection record says so.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MarketingCampaign, PlatformAsset, PlatformId } from "@/lib/marketing/types";
import type { BrandValidationReport } from "@/lib/marketing/branding";
import type { OAuthConfigState } from "@/lib/marketing/oauth";

const BUCKET = "marketing-videos";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
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
  providerModel: string | null;
  storagePath: string | null;
  playbackUrl: string | null;
  brandValidation: BrandValidationReport | null;
  failureReason: string | null;
  estimatedCostPence: number | null;
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
    providerModel: row.provider_model ?? null,
    storagePath: row.storage_path ?? null,
    playbackUrl,
    brandValidation: (row.brand_validation ?? null) as BrandValidationReport | null,
    failureReason: row.failure_reason ?? null,
    estimatedCostPence: row.estimated_cost_pence ?? null,
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
    const videos = await Promise.all(((rows ?? []) as any[]).map((row) => rowToVideo(supabase, row)));
    return { videos };
  });

/* -------------------------------------------------------- video generation */

const generateSchema = z.object({
  campaignId: z.string().min(3).max(64),
  assetId: z.string().min(3).max(120),
  tier: z.enum(["draft", "final"]).default("draft"),
});

export const generateCampaignVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ started: boolean; videoId: string | null; detail: string }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);

      const [{ buildVideoPrompt, resolutionFor }, usage, provider] = await Promise.all([
        import("@/lib/marketing/prompt"),
        import("@/lib/marketing/usage"),
        import("@/lib/marketing/video.server"),
      ]);

      const config = provider.videoProviderConfiguration();
      if (config.state === "NOT_CONFIGURED") {
        return { started: false, videoId: null, detail: config.detail };
      }

      const { data: campaignRow } = await supabase
        .from("marketing_campaigns")
        .select("campaign")
        .eq("id", data.campaignId)
        .maybeSingle();
      if (!campaignRow?.campaign) throw new Error("That campaign no longer exists.");
      const campaign = campaignRow.campaign as MarketingCampaign;
      const asset = campaign.assets.find((entry) => entry.id === data.assetId);
      if (!asset) throw new Error("That platform asset no longer exists.");

      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const [{ count: videosToday }, { count: videosForCampaign }, { count: attemptsForAsset }] =
        await Promise.all([
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
        return { started: false, videoId: null, detail: decision.reason };
      }

      const spec = buildVideoPrompt(campaign, asset);
      const resolution = resolutionFor(asset.aspect, data.tier);
      const job = await provider.createVideoJob({
        prompt: spec.prompt,
        aspect: asset.aspect,
        seconds: Math.min(10, spec.seconds),
        resolution,
      });

      if (!job.ok) {
        await supabase.from("marketing_videos").insert({
          campaign_id: campaign.id,
          asset_id: asset.id,
          platform: asset.platform,
          aspect: asset.aspect,
          seconds: Math.min(10, spec.seconds),
          resolution,
          provider_id: config.id,
          status: job.status === "PROVIDER_NOT_CONFIGURED" ? "PROVIDER_NOT_CONFIGURED" : "VIDEO_GENERATION_FAILED",
          prompt: spec.prompt,
          failure_reason: job.reason,
          attempt: (attemptsForAsset ?? 0) + 1,
        });
        await supabase.from("marketing_audit").insert({
          campaign_id: campaign.id,
          action: "video_generation_failed",
          detail: job.reason,
          actor: "engine",
          actor_id: context.userId,
        });
        return { started: false, videoId: null, detail: job.reason };
      }

      const { data: inserted, error } = await supabase
        .from("marketing_videos")
        .insert({
          campaign_id: campaign.id,
          asset_id: asset.id,
          platform: asset.platform,
          aspect: asset.aspect,
          seconds: Math.min(10, spec.seconds),
          resolution,
          provider_id: config.id,
          provider_model: job.model,
          provider_job_id: job.jobId,
          status: "GENERATING",
          prompt: spec.prompt,
          estimated_cost_pence: usage.estimatedCostPence(resolution, Math.min(10, spec.seconds)),
          attempt: (attemptsForAsset ?? 0) + 1,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabase.from("marketing_audit").insert({
        campaign_id: campaign.id,
        action: "video_generation_started",
        detail: `Generation requested for ${asset.platform} (${asset.aspect}, ${resolution}).`,
        actor: "engine",
        actor_id: context.userId,
      });

      return {
        started: true,
        videoId: inserted.id as string,
        detail: "Generation started. This usually takes one to three minutes.",
      };
    },
  );

/**
 * Polls a generation job. On completion the file is downloaded, stored in the
 * private bucket and brand-validated. Only then is the video marked RENDERED.
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

    const [{ pollVideoJob }, { buildBrandOverlay, validateBranding }, { taglineFor }] =
      await Promise.all([
        import("@/lib/marketing/video.server"),
        import("@/lib/marketing/branding"),
        import("@/lib/marketing/brand"),
      ]);

    const poll = await pollVideoJob(row.provider_job_id as string);
    if (!poll.ok) {
      const { data: failed } = await supabase
        .from("marketing_videos")
        .update({ status: "VIDEO_GENERATION_FAILED", failure_reason: poll.reason })
        .eq("id", row.id)
        .select("*")
        .single();
      await supabase.from("marketing_audit").insert({
        campaign_id: row.campaign_id,
        action: "video_generation_failed",
        detail: poll.reason,
        actor: "engine",
        actor_id: context.userId,
      });
      return { video: await rowToVideo(supabase, failed) };
    }
    if (!poll.done) return { video: await rowToVideo(supabase, row) };

    const path = `${row.campaign_id}/${row.asset_id}-${row.id}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, poll.bytes, { contentType: poll.contentType, upsert: true });
    if (uploadError) {
      const { data: failed } = await supabase
        .from("marketing_videos")
        .update({ status: "RENDER_FAILED", failure_reason: uploadError.message })
        .eq("id", row.id)
        .select("*")
        .single();
      return { video: await rowToVideo(supabase, failed) };
    }

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
      rendered: { aspect: row.aspect, seconds: row.seconds },
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
        storage_path: path,
        duration_seconds: row.seconds,
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
        ? `Video rendered and stored for ${row.platform}.`
        : brand.failures.join(" "),
      actor: "engine",
      actor_id: context.userId,
    });

    return { video: await rowToVideo(supabase, done) };
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

    const [{ allCapabilities, defaultMarketingSettings }, { oauthConfigState, OAUTH_DEFINITIONS }, provider] =
      await Promise.all([
        import("@/lib/marketing/platforms"),
        import("@/lib/marketing/oauth"),
        import("@/lib/marketing/video.server"),
      ]);

    const { data: settingsRow } = await supabase
      .from("marketing_settings")
      .select("settings")
      .eq("id", true)
      .maybeSingle();
    const settings = { ...defaultMarketingSettings(), ...((settingsRow?.settings ?? {}) as object) };

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
  .handler(async ({ data, context }): Promise<{ ok: boolean; url: string | null; detail: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { oauthConfigState, oauthDefinition, authorizeUrl } = await import("@/lib/marketing/oauth");
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
  });

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
    const { defaultMarketingSettings } = await import("@/lib/marketing/platforms");
    const { data: row } = await supabase
      .from("marketing_settings")
      .select("settings")
      .eq("id", true)
      .maybeSingle();
    const settings: any = { ...defaultMarketingSettings(), ...((row?.settings ?? {}) as object) };

    if (data.mode) settings.platformModes = { ...settings.platformModes, [data.platform]: data.mode };
    if (data.paused !== undefined) {
      const paused = new Set<string>(settings.pausedPlatforms ?? []);
      if (data.paused) paused.add(data.platform);
      else paused.delete(data.platform);
      settings.pausedPlatforms = [...paused];
    }

    await supabase.from("marketing_settings").upsert({ id: true, settings });
    await supabase.from("marketing_audit").insert({
      action: data.paused === undefined ? "publishing_mode_changed" : data.paused ? "paused" : "resumed",
      detail: `${data.platform}: ${data.mode ?? (data.paused ? "publishing paused" : "publishing resumed")}.`,
      actor: "human",
      actor_id: context.userId,
    });
    return { ok: true };
  });
