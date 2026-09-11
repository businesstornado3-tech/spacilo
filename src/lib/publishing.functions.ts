/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here.
 */
/**
 * Founder Console publishing surface — one canonical path for every platform.
 *
 * This does NOT add a second publishing system: it reuses the existing
 * adapters, the existing publication state machine and the existing stored
 * authorisations. What it adds is a per-asset, per-platform view and action, so
 * the founder can publish one video to one destination and see exactly what is
 * possible today.
 *
 * Absolute rules kept from the existing architecture:
 *   - Only the FINAL BRANDED artifact (`marketing_videos.storage_path`, which
 *     is only written after branding validation) is ever published. A raw
 *     provider file lives at a different path and has no `storage_path`.
 *   - PUBLISHED only ever comes from a platform confirmation carrying an id.
 *   - Connection is never conflated with publishing capability.
 *   - No token, secret or authorisation header ever leaves the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runtimeFetch } from "@/lib/marketing/runtime-fetch";

const BUCKET = "marketing-videos";
const MEDIA_LINK_SECONDS = 3600;

/** The platforms this console can publish to today. */
export const PUBLISHABLE_PLATFORMS = [
  "youtube",
  "youtube_shorts",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "pinterest",
] as const;
export type PublishablePlatform = (typeof PUBLISHABLE_PLATFORMS)[number];

export type YoutubeVisibility = "private" | "unlisted" | "public";

/** Connection and publishing capability, deliberately kept apart. */
export type PlatformPublishingState = {
  platform: PublishablePlatform;
  label: string;
  /** Whether an account/authorisation exists at all. */
  connected: boolean;
  connectionLabel: string;
  /** The destination account/page/channel, when one is chosen. */
  destination: string | null;
  /** Whether a publish can actually be attempted right now. */
  canPublish: boolean;
  /** Publishing capability, separate from the connection. */
  capability:
    | "READY"
    | "SETUP_REQUIRED"
    | "AUTHORIZATION_REQUIRED"
    | "PAUSED"
    | "NOT_CONNECTED"
    | "LAST_ATTEMPT_FAILED";
  capabilityDetail: string;
  /** True where Shorts reuse the YouTube channel rather than a second sign-in. */
  sharesConnectionWith: PublishablePlatform | null;
  /** Only YouTube offers a visibility choice at upload time. */
  supportsVisibility: boolean;
  lastError: string | null;
};

export type AssetPublicationState = {
  platform: string;
  state: string;
  platformPostId: string | null;
  platformUrl: string | null;
  error: string | null;
  publishedAt: string | null;
  /**
   * True when the record predates per-video publication identity, i.e. it
   * belongs to an earlier video of the same asset. A historical record never
   * makes the current video look published.
   */
  historical: boolean;
};

export type PublishableAsset = {
  assetId: string;
  videoId: string;
  /** The platform the asset was produced for. */
  producedFor: string;
  aspect: string;
  seconds: number;
  title: string;
  description: string;
  caption: string;
  /** True only when the final branded file is stored. */
  brandedArtifactReady: boolean;
  artifactDetail: string;
  /** When this exact video was made, so the newest one is identifiable. */
  createdAt: string;
  /** How it was made: PAID_CLOUD, FREE_CLOUD, LOCAL or BROWSER. */
  executionMode: string;
  /** True for the one video this campaign publishes right now. */
  isCurrent: boolean;
  /** Publications for THIS video only (plus flagged historical ones). */
  publications: AssetPublicationState[];
};

export type PublishingSurface = {
  campaignId: string | null;
  campaignStatus: string | null;
  platforms: PlatformPublishingState[];
  assets: PublishableAsset[];
  publishingPaused: boolean;
  /** The exact video every platform publishes today, when one exists. */
  currentVideoId: string | null;
};

const LABEL: Record<PublishablePlatform, string> = {
  youtube: "YouTube",
  youtube_shorts: "YouTube Shorts",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

async function assertAdmin(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

/**
 * Builds the connection-versus-capability answer for one platform. Shorts read
 * the YouTube row: there is one YouTube authorisation and one channel.
 */
export function platformStateFrom(input: {
  platform: PublishablePlatform;
  connectionRow: {
    connection?: string;
    account_id?: string | null;
    account_label?: string | null;
    last_error?: string | null;
    destination_id?: string | null;
    destination_label?: string | null;
  } | null;
  hasToken: boolean;
  paused: boolean;
}): PlatformPublishingState {
  const { platform, connectionRow, hasToken, paused } = input;
  const connected = connectionRow?.connection === "CONNECTED";
  // Pinterest pins to a board and LinkedIn posts as a chosen author, so for
  // those two the destination is the founder's explicit choice, never the
  // account itself.
  const needsChoice = platform === "pinterest" || platform === "linkedin";
  const destination = needsChoice
    ? (connectionRow?.destination_label ?? connectionRow?.destination_id ?? null)
    : (connectionRow?.account_label ?? connectionRow?.account_id ?? null);
  const shares: PublishablePlatform | null = platform === "youtube_shorts" ? "youtube" : null;
  const base = {
    platform,
    label: LABEL[platform],
    connected,
    connectionLabel: connected ? "CONNECTED" : "NOT CONNECTED",
    destination,
    sharesConnectionWith: shares,
    supportsVisibility: platform === "youtube" || platform === "youtube_shorts",
    lastError: connectionRow?.last_error ?? null,
  };

  if (!connected) {
    return {
      ...base,
      canPublish: false,
      capability: "NOT_CONNECTED",
      capabilityDetail:
        shares === "youtube"
          ? "Shorts publish to the connected YouTube channel; connect YouTube once and Shorts follow it."
          : "No account is connected for this platform yet.",
    };
  }
  if (!hasToken) {
    return {
      ...base,
      canPublish: false,
      capability: "AUTHORIZATION_REQUIRED",
      capabilityDetail: "The account is connected but no usable authorisation is stored.",
    };
  }
  if (!destination) {
    return {
      ...base,
      canPublish: false,
      capability: "SETUP_REQUIRED",
      capabilityDetail:
        platform === "facebook"
          ? "Connected, but no Facebook Page is selected as the destination."
          : platform === "pinterest"
            ? "Connected, but no Pinterest board is chosen to pin to."
            : platform === "linkedin"
              ? "Connected, but no LinkedIn author is chosen — your profile or a Company Page."
              : "Connected, but no destination account or channel has been chosen.",
    };
  }
  if (paused) {
    return {
      ...base,
      canPublish: false,
      capability: "PAUSED",
      capabilityDetail: "Publishing is paused. Turn publishing back on to publish.",
    };
  }
  return {
    ...base,
    canPublish: true,
    capability: "READY",
    capabilityDetail:
      platform === "youtube" || platform === "youtube_shorts"
        ? "Connected and able to upload. YouTube decides the final visibility; EarnRoom reads it back after the upload."
        : "Connected and able to publish.",
  };
}

/**
 * Everything the publishing panel needs: capability per platform, and the
 * campaign's assets with their final branded artifact state.
 */
export const getPublishingSurface = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ campaignId: z.string().min(3).max(64).nullable().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<PublishingSurface> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);

    const [{ data: settingsRow }, { data: connectionRows }] = await Promise.all([
      supabase.from("marketing_settings").select("settings").eq("id", true).maybeSingle(),
      supabase
        .from("marketing_platform_connections")
        .select("platform, connection, account_id, account_label, last_error"),
    ]);
    const settings = (settingsRow?.settings ?? {}) as any;
    const pausedAll = Boolean(settings.pauseAllPublishing);
    const pausedPlatforms: string[] = settings.pausedPlatforms ?? [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokenRows } = await (supabaseAdmin as any)
      .from("marketing_platform_tokens")
      .select("platform, access_token_cipher, page_token_cipher, expires_at");

    const hasToken = (platform: PublishablePlatform): boolean => {
      const key = platform === "youtube_shorts" ? "youtube" : platform;
      const row = ((tokenRows ?? []) as any[]).find((entry) => entry.platform === key);
      if (!row) return false;
      if (key === "facebook") return Boolean(row.page_token_cipher);
      return Boolean(row.access_token_cipher);
    };

    const platforms = PUBLISHABLE_PLATFORMS.map((platform) => {
      const key = platform === "youtube_shorts" ? "youtube" : platform;
      const row = ((connectionRows ?? []) as any[]).find((entry) => entry.platform === key) ?? null;
      return platformStateFrom({
        platform,
        connectionRow: row,
        hasToken: hasToken(platform),
        paused: pausedAll || pausedPlatforms.includes(platform),
      });
    });

    const campaignId = data.campaignId ?? null;
    if (!campaignId) {
      return {
        campaignId: null,
        campaignStatus: null,
        platforms,
        assets: [],
        publishingPaused: pausedAll,
        currentVideoId: null,
      };
    }

    const [{ data: campaignRow }, { data: videoRows }, { data: pubRows }] = await Promise.all([
      supabase
        .from("marketing_campaigns")
        .select("campaign, status")
        .eq("id", campaignId)
        .maybeSingle(),
      supabase
        .from("marketing_videos")
        .select("id, asset_id, storage_path, status, aspect, seconds, created_at, execution_mode")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      supabase
        .from("marketing_publications")
        .select(
          "asset_id, video_id, platform, state, platform_post_id, platform_url, error, published_at",
        )
        .eq("campaign_id", campaignId),
    ]);

    // A campaign can hold several videos and each is published in its own
    // right. This is only the one the Studio opens on: the newest stored file.
    const { resolveProductionVideo } = await import("@/lib/marketing/production-asset");
    const production = resolveProductionVideo(
      ((videoRows ?? []) as any[]).map((row) => ({
        id: row.id,
        assetId: row.asset_id,
        storagePath: row.storage_path ?? null,
        executionMode: row.execution_mode ?? null,
        createdAt: row.created_at,
        seconds: row.seconds ?? null,
      })),
    );
    const currentVideoId = production.ok ? production.video.id : null;

    const campaign = (campaignRow?.campaign ?? null) as any;
    /** The first video ever made for an asset — where pre-identity history sits. */
    const oldestVideoForAsset = (assetId: string): string | null =>
      ((videoRows ?? []) as any[])
        .filter((row) => row.asset_id === assetId)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0]?.id ?? null;
    const assets: PublishableAsset[] = [];
    for (const video of (videoRows ?? []) as any[]) {
      const source = ((campaign?.assets ?? []) as any[]).find(
        (entry) => entry.id === video.asset_id,
      );
      const branded = Boolean(video.storage_path);
      assets.push({
        assetId: video.asset_id,
        videoId: video.id,
        producedFor: source?.platform ?? "unknown",
        aspect: video.aspect ?? source?.aspect ?? "9:16",
        seconds: video.seconds ?? source?.seconds ?? 0,
        title: String(source?.title ?? "EarnRoom").slice(0, 100),
        description: String(
          source?.description ?? "EarnRoom — make space earn. https://earnroom.co.uk",
        ),
        caption: String(source?.caption ?? source?.description ?? "EarnRoom — make space earn."),
        brandedArtifactReady: branded,
        artifactDetail: branded
          ? "Final branded EarnRoom video stored and validated."
          : `Not publishable: the branded EarnRoom file is not stored yet (${video.status ?? "unknown"}). The raw AI file is never published.`,
        createdAt: video.created_at,
        executionMode: video.execution_mode ?? "UNKNOWN",
        isCurrent: video.id === currentVideoId,
        /*
         * A publication belongs to the exact video that produced it, and to no
         * other. Records written before per-video identity existed carry no
         * video: they are attached to the OLDEST video of that asset and
         * flagged as history, so a newly made video can never inherit them.
         */
        publications: ((pubRows ?? []) as any[])
          .filter((entry) =>
            entry.video_id
              ? entry.video_id === video.id
              : entry.asset_id === video.asset_id &&
                video.id === oldestVideoForAsset(video.asset_id),
          )
          .map((entry) => ({
            platform: entry.platform,
            state: entry.state,
            platformPostId: entry.platform_post_id ?? null,
            platformUrl: entry.platform_url ?? null,
            error: entry.error ?? null,
            publishedAt: entry.published_at ?? null,
            historical: !entry.video_id,
          })),
      });
    }

    return {
      campaignId,
      campaignStatus: campaignRow?.status ?? null,
      currentVideoId,
      platforms,
      assets,
      publishingPaused: pausedAll,
    };
  });

export type PublishOutcome = {
  ok: boolean;
  state: string;
  detail: string;
  platformPostId: string | null;
  platformUrl: string | null;
  /** What the platform itself reports the visibility to be (YouTube). */
  visibility: string | null;
  alreadyPublished: boolean;
  /** Short reference for this attempt, also stored with the failure record. */
  attemptRef: string;
  /** True when trying again unchanged could plausibly work. */
  retryable: boolean;
};

/** A short, non-secret reference so a founder can quote one attempt. */
export function attemptReference(platform: string, at: number): string {
  return `${platform.slice(0, 2).toUpperCase()}-${at.toString(36).toUpperCase().slice(-6)}`;
}

/**
 * Whether an unchanged retry could plausibly succeed. Authorisation and
 * platform-rejection failures need a fix first, so the console must not invite
 * the founder to hammer the same request.
 */
export function retryableState(state: string): boolean {
  return state === "UPLOAD_FAILED" || state === "PAUSED";
}

/**
 * Publishes ONE stored, branded video to ONE platform, through the existing
 * adapter and state machine. Refuses honestly rather than pretending.
 */
export const publishVideoToPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        videoId: z.string().uuid(),
        platform: z.enum(PUBLISHABLE_PLATFORMS),
        visibility: z.enum(["private", "unlisted", "public"]).optional(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(4000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PublishOutcome> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const platform = data.platform;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const attemptRef = attemptReference(platform, now);

    const refuse = (detail: string, state = "AUTH_REQUIRED"): PublishOutcome => ({
      ok: false,
      state,
      detail,
      platformPostId: null,
      platformUrl: null,
      visibility: null,
      alreadyPublished: false,
      attemptRef,
      retryable: retryableState(state),
    });

    /* Settings and pause control. */
    const { data: settingsRow } = await supabase
      .from("marketing_settings")
      .select("settings")
      .eq("id", true)
      .maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    if (settings.pauseAllPublishing || (settings.pausedPlatforms ?? []).includes(platform)) {
      return refuse("Publishing is paused. Turn publishing back on before trying again.", "PAUSED");
    }

    /* The stored video: only a branded, validated artifact has a storage_path. */
    const { data: video } = await supabase
      .from("marketing_videos")
      .select("id, campaign_id, asset_id, storage_path, status, aspect, seconds")
      .eq("id", data.videoId)
      .maybeSingle();
    if (!video) return refuse("That video no longer exists.", "VALIDATION_FAILED");
    if (!video.storage_path) {
      return refuse(
        "The final branded EarnRoom video is not stored for this asset yet. The raw AI file is never published.",
        "VALIDATION_FAILED",
      );
    }

    /* Duplicate protection — one confirmed publication per VIDEO per platform.
     * A record from an earlier video of the same asset is history: it must
     * never make a newly produced video look published. */
    const { data: videoPubRows } = await supabase
      .from("marketing_publications")
      .select("id, state, platform_post_id, platform_url, video_id, asset_id")
      .eq("campaign_id", video.campaign_id)
      .eq("platform", platform);
    const rows = (videoPubRows ?? []) as any[];
    /*
     * Only this video's own record counts. A record belonging to another video
     * of the same campaign — including a pre-identity record with no video on
     * it — is history and is never reused, never updated and never allowed to
     * make this video look published.
     */
    const existingPub = rows.find((row) => row.video_id === video.id) ?? null;
    if (existingPub?.state === "PUBLISHED") {
      return {
        ok: true,
        state: "PUBLISHED",
        detail: "Already published. EarnRoom did not create a second post.",
        platformPostId: existingPub.platform_post_id ?? null,
        platformUrl: existingPub.platform_url ?? null,
        visibility: null,
        alreadyPublished: true,
        attemptRef,
        retryable: false,
      };
    }

    /* Connection and destination. */
    const connectionKey = platform === "youtube_shorts" ? "youtube" : platform;
    const { data: connectionRows } = await supabase
      .from("marketing_platform_connections")
      .select(
        "platform, connection, account_id, account_label, last_error, destination_id, destination_label",
      );
    const connection = ((connectionRows ?? []) as any[]).find(
      (row) => row.platform === connectionKey,
    );
    if (connection?.connection !== "CONNECTED" || !connection.account_id) {
      return refuse(
        platform === "facebook"
          ? "No Facebook Page is selected. Choose the Page to publish to first."
          : platform === "instagram"
            ? "No Instagram professional account is stored. Reconnect Instagram."
            : platform === "youtube" || platform === "youtube_shorts"
              ? "No YouTube channel is selected as the destination yet."
              : `${LABEL[platform]} is not connected yet.`,
      );
    }
    // Pinterest must be told which board, and LinkedIn who to post as. Neither
    // is ever guessed.
    if ((platform === "pinterest" || platform === "linkedin") && !connection.destination_id) {
      return refuse(
        platform === "pinterest"
          ? "Choose the Pinterest board to pin to first."
          : "Choose the LinkedIn author to post as first — your profile or a Company Page.",
      );
    }

    /* Authorisation, decrypted server side only. */
    let accessToken: string | null = null;
    let pageToken: string | null = null;
    if (platform === "facebook") {
      const { readMetaTokens } = await import("@/lib/meta.functions");
      ({ pageToken } = await readMetaTokens());
      accessToken = pageToken;
      if (!pageToken) {
        return refuse("No Facebook Page authorisation is stored. Select the Facebook Page again.");
      }
    } else if (platform === "instagram") {
      const { readInstagramToken } = await import("@/lib/meta.functions");
      const stored = await readInstagramToken();
      accessToken = stored.token;
      if (!accessToken) return refuse(stored.detail);
    } else {
      const { youtubeAccessToken } = await import("@/lib/marketing/youtube-token.server");
      const stored = await youtubeAccessToken();
      accessToken = stored.token;
      if (!accessToken) return refuse(stored.detail);
    }

    /* A short-lived link to this one stored object, so the platform can fetch it. */
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .createSignedUrl(video.storage_path, MEDIA_LINK_SECONDS);
    if (!signed?.signedUrl) {
      return refuse("The stored video file could not be prepared for upload.", "UPLOAD_FAILED");
    }

    const { data: campaignRow } = await supabase
      .from("marketing_campaigns")
      .select("id, campaign")
      .eq("id", video.campaign_id)
      .maybeSingle();
    const campaign = (campaignRow?.campaign ?? null) as any;
    const sourceAsset = ((campaign?.assets ?? []) as any[]).find(
      (entry) => entry.id === video.asset_id,
    );

    const { adapterFor, attemptPublish, defaultMarketingSettings } =
      await import("@/lib/marketing");
    const mergedSettings = { ...defaultMarketingSettings(), ...settings } as any;
    const connections = ((connectionRows ?? []) as any[]).map((row) => ({
      platform: row.platform === "youtube" ? row.platform : row.platform,
      connection: row.connection,
      scopes: [],
      expiresAt: null,
      lastError: null,
    }));
    // Shorts share the YouTube authorisation: the capability layer is told so
    // explicitly rather than treating Shorts as a disconnected account.
    if (platform === "youtube_shorts") {
      connections.push({
        platform: "youtube_shorts",
        connection: connection.connection,
        scopes: [],
        expiresAt: null,
        lastError: null,
      });
    }

    const asset = {
      id: video.asset_id,
      platform,
      aspect: video.aspect ?? sourceAsset?.aspect ?? "9:16",
      hook: sourceAsset?.hook ?? "",
      title: String(data.title ?? sourceAsset?.title ?? "EarnRoom").slice(0, 100),
      description: String(
        data.description ??
          sourceAsset?.description ??
          "EarnRoom — peer-to-peer storage. https://earnroom.co.uk",
      ),
      caption: String(
        sourceAsset?.caption ?? sourceAsset?.description ?? "EarnRoom — make space earn.",
      ),
      hashtags: sourceAsset?.hashtags ?? [],
      cta: sourceAsset?.cta ?? "",
      seconds: video.seconds ?? sourceAsset?.seconds ?? 30,
      state: "QUEUED",
      videoUrl: signed.signedUrl as string,
      thumbnailUrl: null,
      videoStatus: "GENERATED",
    } as any;

    const adapter = adapterFor(platform as any, {
      connection: connections.find((entry) => entry.platform === platform) ?? null,
      accessToken,
      accountId: connection.account_id,
      pageAccessToken: pageToken,
      settings: mergedSettings,
      connections: connections as any,
      now,
      fetchImpl: runtimeFetch,
      ...(data.visibility ? { youtubePrivacy: data.visibility } : {}),
    });

    const attempt = await attemptPublish({
      adapter,
      asset,
      campaign: (campaign ?? { id: video.campaign_id, assets: [] }) as any,
      connections: connections as any,
      settings: mergedSettings,
      record: {
        campaignId: video.campaign_id,
        assetId: video.asset_id,
        platform: platform as any,
        state: "QUEUED",
        platformPostId: null,
        platformUrl: null,
        error: null,
        retryCount: 0,
        updatedAt: now,
      },
      now,
    });

    const published = attempt.record.state === "PUBLISHED";

    /* What the platform itself says the visibility is — never what was asked for. */
    let visibility: string | null = null;
    let visibilityNote = "";
    if (published && (platform === "youtube" || platform === "youtube_shorts")) {
      const { fetchYoutubeVideoStatus } = await import("@/lib/marketing/youtube");
      const status = await fetchYoutubeVideoStatus(
        runtimeFetch,
        accessToken as string,
        attempt.record.platformPostId as string,
      );
      visibility = status.privacyStatus;
      const asked = data.visibility ?? "unlisted";
      if (visibility && visibility !== asked) {
        visibilityNote =
          asked === "public"
            ? " PUBLIC PUBLISHING NOT AVAILABLE: YouTube stored the upload as " +
              `${visibility}. Google restricts public uploads from an unverified API project.`
            : ` YouTube stored the upload as ${visibility}.`;
      }
    }

    const publicationRow = {
      campaign_id: video.campaign_id,
      asset_id: video.asset_id,
      video_id: video.id,
      platform,
      state: attempt.record.state,
      platform_post_id: attempt.record.platformPostId,
      platform_url: attempt.record.platformUrl,
      // The REAL provider reason is stored verbatim (already sanitised of any
      // token by the adapter), with a short reference the founder can quote.
      error: published
        ? null
        : `${attempt.record.error ?? attempt.record.state} [ref ${attemptRef}]`,
      published_at: published ? nowIso : null,
      updated_at: nowIso,
    };
    if (existingPub?.id) {
      await supabase.from("marketing_publications").update(publicationRow).eq("id", existingPub.id);
    } else {
      await supabase.from("marketing_publications").insert(publicationRow);
    }

    await supabase
      .from("marketing_platform_connections")
      .update({
        last_error: published ? null : attempt.record.error,
        last_checked_at: nowIso,
        ...(published ? { last_published_at: nowIso } : {}),
      })
      .eq("platform", connectionKey);

    await supabase.from("marketing_audit").insert({
      campaign_id: video.campaign_id,
      action: published ? "published" : "publication_blocked",
      detail: published
        ? `${LABEL[platform]} confirmed publication ${attempt.record.platformPostId}.${visibilityNote}`
        : `${LABEL[platform]} [ref ${attemptRef}]: ${attempt.record.error ?? attempt.record.state}`,
      actor: "human",
      actor_id: context.userId,
    });

    return {
      ok: published,
      state: attempt.record.state,
      detail: published
        ? `${LABEL[platform]} confirmed the publication.${visibilityNote}`
        : (attempt.record.error ?? "The platform did not confirm a publication."),
      platformPostId: attempt.record.platformPostId,
      platformUrl: attempt.record.platformUrl,
      visibility,
      alreadyPublished: false,
      attemptRef,
      retryable: retryableState(attempt.record.state),
    };
  });
