/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here. Every row is narrowed into
 * the typed shapes exported from `@/lib/marketing`.
 */
/**
 * Facebook Page and Instagram Professional publishing — server side only.
 *
 * SECURITY
 * - Every function re-checks `is_platform_admin(auth.uid())`.
 * - The Meta user token and the Facebook Page token are decrypted inside these
 *   handlers only, using the existing token encryption. Neither token, nor the
 *   app secret, nor an authorisation code is ever returned to the browser or
 *   written to the audit trail.
 * - Nothing here simulates Meta. A publication is only recorded when Meta
 *   itself returns a real video id or a real published media id.
 *
 * This reuses the existing OAuth flow, connection tables, token table,
 * publication state machine and audit log. It adds no parallel architecture.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaStatusDetail, metaStatusWord, type MetaStatusWord } from "@/lib/marketing/meta";
import {
  instagramStatusDetail,
  instagramStatusWord,
  type InstagramStatusWord,
} from "@/lib/marketing/instagram-login";

const BUCKET = "marketing-videos";
/** Meta must be able to fetch the file for the whole processing window. */
const MEDIA_LINK_SECONDS = 3600;

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

function metaConfigured(): boolean {
  return Boolean(process.env["META_APP_ID"] && process.env["META_APP_SECRET"]);
}

/* ------------------------------------------------------------ token access */

type MetaTokens = {
  userToken: string | null;
  pageToken: string | null;
  expiresAt: number | null;
  detail: string;
};

/**
 * Reads the stored Meta authorisation. Either the Facebook or the Instagram
 * connection row may hold it — they are the same Meta sign-in.
 */
async function readMetaTokens(): Promise<MetaTokens> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken } = await import("@/lib/marketing/token-crypto.server");
  const { data: rows } = await (supabaseAdmin as any)
    .from("marketing_platform_tokens")
    .select("platform, access_token_cipher, page_token_cipher, expires_at")
    .in("platform", ["facebook", "instagram"]);

  const list = (rows ?? []) as any[];
  const row = list.find((entry) => entry.platform === "facebook") ?? list[0];
  if (!row) {
    return { userToken: null, pageToken: null, expiresAt: null, detail: "Meta is not connected." };
  }
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  let userToken: string | null = null;
  let pageToken: string | null = null;
  try {
    userToken = await decryptToken(row.access_token_cipher);
  } catch {
    userToken = null;
  }
  if (row.page_token_cipher) {
    try {
      pageToken = await decryptToken(row.page_token_cipher);
    } catch {
      pageToken = null;
    }
  }
  return {
    userToken,
    pageToken,
    expiresAt,
    detail: userToken
      ? "Stored authorisation read."
      : "The stored authorisation could not be read. Reconnect Meta.",
  };
}

/**
 * Reads the stored Instagram Login authorisation. This is an INSTAGRAM USER
 * token stored under the `instagram` platform row; it is unrelated to the
 * Facebook Page token and is never returned to the browser.
 */
async function readInstagramToken(): Promise<{ token: string | null; detail: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken } = await import("@/lib/marketing/token-crypto.server");
  const { data: row } = await (supabaseAdmin as any)
    .from("marketing_platform_tokens")
    .select("access_token_cipher, expires_at")
    .eq("platform", "instagram")
    .maybeSingle();
  if (!row?.access_token_cipher) {
    return { token: null, detail: "Instagram is not connected." };
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return { token: null, detail: "TOKEN_EXPIRED: the Instagram authorisation has expired." };
  }
  try {
    return { token: await decryptToken(row.access_token_cipher), detail: "Stored authorisation read." };
  } catch {
    return {
      token: null,
      detail: "The stored authorisation could not be read. Reconnect Instagram.",
    };
  }
}

/* ------------------------------------------------------------ console state */

export type MetaPlatformState = {
  platform: "facebook" | "instagram";
  status: MetaStatusWord | InstagramStatusWord;
  detail: string;
  accountId: string | null;
  accountLabel: string | null;
  linkedPageId: string | null;
  paused: boolean;
  lastError: string | null;
  lastPublishedAt: string | null;
};

export type MetaConnectionState = {
  configured: boolean;
  connected: boolean;
  facebook: MetaPlatformState;
  instagram: MetaPlatformState;
};

async function buildState(supabase: any): Promise<MetaConnectionState> {
  const [{ data: rows }, settings] = await Promise.all([
    supabase
      .from("marketing_platform_connections")
      .select(
        "platform, connection, expires_at, last_error, account_id, account_label, linked_page_id, last_published_at",
      )
      .in("platform", ["facebook", "instagram"]),
    (async () => {
      const { data } = await supabase
        .from("marketing_settings")
        .select("settings")
        .eq("id", true)
        .maybeSingle();
      return (data?.settings ?? {}) as any;
    })(),
  ]);

  const list = (rows ?? []) as any[];
  const pausedAll = Boolean(settings?.pauseAllPublishing);
  const pausedPlatforms: string[] = settings?.pausedPlatforms ?? [];
  const configured = metaConfigured();

  const build = (platform: "facebook" | "instagram"): MetaPlatformState => {
    const row = list.find((entry) => entry.platform === platform) ?? null;
    const facebookRow = list.find((entry) => entry.platform === "facebook") ?? null;
    const expired = Boolean(row?.expires_at && Date.parse(row.expires_at) <= Date.now());

    // Instagram stands alone: Instagram Login, its own authorisation, its own
    // account. It no longer inherits the Facebook connection or Page choice.
    if (platform === "instagram") {
      const igInput = {
        configured,
        connected: row?.connection === "CONNECTED",
        expired,
        paused: pausedAll || pausedPlatforms.includes("instagram"),
        accountFound: Boolean(row?.account_id),
        lastError: row?.last_error ?? null,
        publishedBefore: Boolean(row?.last_published_at),
      };
      return {
        platform,
        status: instagramStatusWord(igInput),
        detail: instagramStatusDetail(igInput),
        accountId: row?.account_id ?? null,
        accountLabel: row?.account_label ?? null,
        linkedPageId: null,
        paused: igInput.paused,
        lastError: row?.last_error ?? null,
        lastPublishedAt: row?.last_published_at ?? null,
      };
    }

    const connected = row?.connection === "CONNECTED" || facebookRow?.connection === "CONNECTED";
    const input = {
      platform,
      configured,
      connected,
      expired,
      paused: pausedAll || pausedPlatforms.includes(platform),
      pageSelected: Boolean(facebookRow?.account_id),
      instagramFound: Boolean(list.find((entry) => entry.platform === "instagram")?.account_id),
      lastError: row?.last_error ?? null,
      publishedBefore: Boolean(row?.last_published_at),
    };
    return {
      platform,
      status: metaStatusWord(input),
      detail: metaStatusDetail(input),
      accountId: row?.account_id ?? null,
      accountLabel: row?.account_label ?? null,
      linkedPageId: row?.linked_page_id ?? facebookRow?.account_id ?? null,
      paused: input.paused,
      lastError: row?.last_error ?? null,
      lastPublishedAt: row?.last_published_at ?? null,
    };
  };

  return {
    configured,
    connected: list.some((entry) => entry.connection === "CONNECTED"),
    facebook: build("facebook"),
    instagram: build("instagram"),
  };
}

export const getMetaConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaConnectionState> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    return buildState(supabase);
  });

/* -------------------------------------------------------- page discovery */

export type MetaPageOption = {
  id: string;
  name: string;
  category: string | null;
  canPublish: boolean;
};

/**
 * Lists the Facebook Pages the connected Meta account manages. Only the id,
 * name and category leave the server — never the Page access token.
 */
export const listMetaPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ ok: boolean; detail: string; pages: MetaPageOption[] }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      if (!metaConfigured()) {
        return {
          ok: false,
          detail: "The Meta application credentials are not set up on the server yet.",
          pages: [],
        };
      }
      const { userToken, detail } = await readMetaTokens();
      if (!userToken) return { ok: false, detail, pages: [] };

      const { discoverPages } = await import("@/lib/marketing/meta");
      const result = await discoverPages(fetch, userToken);
      if (!result.ok) {
        await supabase
          .from("marketing_platform_connections")
          .update({ last_error: result.error, last_checked_at: new Date().toISOString() })
          .eq("platform", "facebook");
        return { ok: false, detail: result.error, pages: [] };
      }
      if (result.value.length === 0) {
        return {
          ok: false,
          detail:
            "No Facebook Page was returned for this Meta account. Make sure the account manages a Page and that the Page was granted during sign-in.",
          pages: [],
        };
      }
      return {
        ok: true,
        detail:
          result.value.length === 1
            ? "One Facebook Page found. Select it to finish setting up publishing."
            : `${result.value.length} Facebook Pages found. Choose which one EarnRoom publishes to.`,
        pages: result.value.map((page) => ({
          id: page.id,
          name: page.name,
          category: page.category,
          canPublish: page.canPublish,
        })),
      };
    },
  );

/**
 * Stores the founder's explicit Page choice, encrypts that Page's access token
 * and looks for the Instagram Professional account linked to it.
 */
export const selectMetaPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ pageId: z.string().min(1).max(64) }).parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; detail: string; state: MetaConnectionState }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { userToken, detail } = await readMetaTokens();
      if (!userToken) {
        return { ok: false, detail, state: await buildState(supabase) };
      }

      const { discoverPages, discoverInstagramAccount } = await import("@/lib/marketing/meta");
      const { encryptToken } = await import("@/lib/marketing/token-crypto.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const pages = await discoverPages(fetch, userToken);
      if (!pages.ok) {
        return { ok: false, detail: pages.error, state: await buildState(supabase) };
      }
      const page = pages.value.find((entry) => entry.id === data.pageId);
      if (!page) {
        return {
          ok: false,
          detail: "That Facebook Page is no longer available to this Meta account.",
          state: await buildState(supabase),
        };
      }
      if (!page.canPublish) {
        return {
          ok: false,
          detail: `The Meta account cannot publish content to ${page.name}. Grant content permissions for that Page and reconnect.`,
          state: await buildState(supabase),
        };
      }

      const pageTokenCipher = await encryptToken(page.accessToken);
      const nowIso = new Date().toISOString();

      // Facebook only. The Instagram token row belongs to Instagram Login.
      await (supabaseAdmin as any)
        .from("marketing_platform_tokens")
        .update({ page_token_cipher: pageTokenCipher, updated_at: nowIso })
        .eq("platform", "facebook");

      await (supabaseAdmin as any).from("marketing_platform_connections").upsert(
        {
          platform: "facebook",
          connection: "CONNECTED",
          account_id: page.id,
          account_label: page.name,
          linked_page_id: page.id,
          last_error: null,
          last_checked_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "platform" },
      );

      /*
       * Informational only. A Facebook Page may or may not have a linked
       * Instagram professional account; either way this NEVER writes the
       * Instagram connection row. Instagram is established solely by the
       * Instagram Login callback.
       */
      const instagram = await discoverInstagramAccount(fetch, page.id, page.accessToken);
      let instagramDetail: string;
      if (!instagram.ok) {
        instagramDetail = `Instagram relationship could not be checked: ${instagram.error}`;
      } else if (!instagram.value) {
        instagramDetail =
          "No Instagram professional account is linked to this Facebook Page. Instagram is connected separately through Instagram Login.";
      } else {
        const label = instagram.value.username
          ? `@${instagram.value.username}`
          : (instagram.value.name ?? "Instagram professional account");
        instagramDetail = `This Page is linked to Instagram ${label}. Connect Instagram separately to publish Reels.`;
      }

      await supabase.from("marketing_audit").insert({
        action: "meta_page_selected",
        detail: `Facebook Page selected: ${page.name}. ${instagramDetail}`,
        actor: "human",
        actor_id: context.userId,
      });

      return {
        ok: true,
        detail: `Publishing to ${page.name}. ${instagramDetail}`,
        state: await buildState(supabase),
      };
    },
  );

/* --------------------------------------------------------- real publishing */

export type MetaPublishOutcome = {
  ok: boolean;
  state: string;
  detail: string;
  platformPostId: string | null;
  platformUrl: string | null;
};

/**
 * Publishes an existing approved EarnRoom marketing video to the selected
 * Facebook Page or the linked Instagram Professional account, through the
 * existing publication state machine. Nothing is generated here.
 */
export const publishMetaVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        platform: z.enum(["facebook", "instagram"]),
        videoId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MetaPublishOutcome> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const platform = data.platform;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const refuse = (detail: string, state = "AUTH_REQUIRED"): MetaPublishOutcome => ({
      ok: false,
      state,
      detail,
      platformPostId: null,
      platformUrl: null,
    });

    if (!metaConfigured()) {
      return refuse("The Meta application credentials are not set up on the server yet.");
    }

    const settingsRow = await supabase
      .from("marketing_settings")
      .select("settings")
      .eq("id", true)
      .maybeSingle();
    const settings = (settingsRow.data?.settings ?? {}) as any;
    if (settings.pauseAllPublishing || (settings.pausedPlatforms ?? []).includes(platform)) {
      return refuse("Publishing is paused. Turn publishing back on before trying again.", "PAUSED");
    }

    const { data: connectionRows } = await supabase
      .from("marketing_platform_connections")
      .select("platform, connection, account_id, account_label")
      .in("platform", ["facebook", "instagram"]);
    const connection = ((connectionRows ?? []) as any[]).find((row) => row.platform === platform);
    if (!connection?.account_id) {
      return refuse(
        platform === "facebook"
          ? "No Facebook Page is selected. Choose the Page to publish to first."
          : "ACCOUNT_NOT_FOUND: no Instagram professional account is stored. Reconnect Instagram.",
      );
    }

    /*
     * Facebook publishes with the Page token; Instagram publishes with the
     * Instagram USER token from Instagram Login. They are read separately.
     */
    let pageToken: string | null = null;
    let instagramToken: string | null = null;
    if (platform === "facebook") {
      ({ pageToken } = await readMetaTokens());
      if (!pageToken) {
        return refuse("No Facebook Page authorisation is stored. Select the Facebook Page again.");
      }
    } else {
      const stored = await readInstagramToken();
      instagramToken = stored.token;
      if (!instagramToken) return refuse(stored.detail);
    }

    /* The stored video and its campaign asset. */
    const { data: video } = await supabase
      .from("marketing_videos")
      .select("id, campaign_id, asset_id, storage_path, status")
      .eq("id", data.videoId)
      .maybeSingle();
    if (!video?.storage_path) {
      return refuse("That video has no stored file.", "VALIDATION_FAILED");
    }
    const { data: campaignRow } = await supabase
      .from("marketing_campaigns")
      .select("id, topic, campaign")
      .eq("id", video.campaign_id)
      .maybeSingle();
    const campaign = campaignRow?.campaign as any;
    const sourceAsset = ((campaign?.assets ?? []) as any[]).find(
      (entry) => entry.id === video.asset_id,
    );

    /* Phase 7: a narrow, short-lived link to this one object only. */
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .createSignedUrl(video.storage_path, MEDIA_LINK_SECONDS);
    if (!signed?.signedUrl) {
      return refuse("The stored video file could not be prepared for Meta.", "UPLOAD_FAILED");
    }

    const { adapterFor, attemptPublish, defaultMarketingSettings } =
      await import("@/lib/marketing");
    const mergedSettings = { ...defaultMarketingSettings(), ...settings } as any;
    const connections = ((connectionRows ?? []) as any[]).map((row) => ({
      platform: row.platform,
      connection: row.connection,
      scopes: [],
      expiresAt: null,
      lastError: null,
    }));

    const asset = {
      id: video.asset_id,
      platform,
      aspect: sourceAsset?.aspect ?? (platform === "instagram" ? "9:16" : "16:9"),
      hook: sourceAsset?.hook ?? "",
      title: String(sourceAsset?.title ?? campaignRow?.topic ?? "EarnRoom").slice(0, 255),
      description: String(
        sourceAsset?.description ?? "EarnRoom — peer-to-peer storage. https://earnroom.co.uk",
      ),
      caption: String(
        sourceAsset?.caption ??
          sourceAsset?.description ??
          "EarnRoom — make space earn. https://earnroom.co.uk",
      ),
      hashtags: sourceAsset?.hashtags ?? [],
      cta: sourceAsset?.cta ?? "",
      seconds: sourceAsset?.seconds ?? 30,
      state: "QUEUED",
      videoUrl: signed.signedUrl as string,
      thumbnailUrl: null,
      videoStatus: "GENERATED",
    } as any;

    const adapter = adapterFor(platform as any, {
      connection: connections.find((entry) => entry.platform === platform) ?? null,
      accessToken: platform === "instagram" ? instagramToken : pageToken,
      accountId: connection.account_id,
      pageAccessToken: pageToken,
      settings: mergedSettings,
      connections: connections as any,
      now,
      fetchImpl: fetch,
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

    /* The existing publication record, keyed the existing way. */
    const { data: existing } = await supabase
      .from("marketing_publications")
      .select("id")
      .eq("campaign_id", video.campaign_id)
      .eq("asset_id", video.asset_id)
      .eq("platform", platform)
      .maybeSingle();
    const publicationRow = {
      campaign_id: video.campaign_id,
      asset_id: video.asset_id,
      platform,
      state: attempt.record.state,
      platform_post_id: attempt.record.platformPostId,
      platform_url: attempt.record.platformUrl,
      error: attempt.record.error,
      published_at: published ? nowIso : null,
      updated_at: nowIso,
    };
    if (existing?.id) {
      await supabase.from("marketing_publications").update(publicationRow).eq("id", existing.id);
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
      .eq("platform", platform);

    await supabase.from("marketing_audit").insert({
      campaign_id: video.campaign_id,
      action: published ? "published" : "publication_blocked",
      detail: published
        ? `${platform === "facebook" ? "Facebook" : "Instagram"} confirmed publication ${attempt.record.platformPostId}.`
        : `${platform}: ${attempt.record.error ?? attempt.record.state}`,
      actor: "human",
      actor_id: context.userId,
    });

    return {
      ok: published,
      state: attempt.record.state,
      detail: published
        ? `${platform === "facebook" ? "Facebook" : "Instagram"} confirmed the publication.`
        : (attempt.record.error ?? "The platform did not confirm a publication."),
      platformPostId: attempt.record.platformPostId,
      platformUrl: attempt.record.platformUrl,
    };
  });

/** Approved, stored EarnRoom marketing videos the founder can publish to Meta. */
export type MetaPublishableVideo = {
  id: string;
  campaignId: string;
  platform: string;
  aspect: string;
  seconds: number;
  createdAt: string;
  title: string;
  playbackUrl: string | null;
};

export const listMetaPublishableVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ videos: MetaPublishableVideo[] }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { data: rows } = await supabase
      .from("marketing_videos")
      .select("id, campaign_id, platform, aspect, seconds, storage_path, created_at, status")
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(25);

    const videos: MetaPublishableVideo[] = [];
    for (const row of (rows ?? []) as any[]) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, 3600);
      videos.push({
        id: row.id,
        campaignId: row.campaign_id,
        platform: row.platform,
        aspect: row.aspect,
        seconds: row.seconds,
        createdAt: row.created_at,
        title: `${row.platform} · ${row.aspect} · ${row.seconds}s`,
        playbackUrl: signed?.signedUrl ?? null,
      });
    }
    return { videos };
  });

/* ----------------------------------------------- instagram insights (real) */

export type InstagramInsightsResult = {
  ok: boolean;
  detail: string;
  /** Real values Instagram returned. Nothing is estimated or invented. */
  platformMetrics: { name: string; value: number }[];
  /** Metrics the API/permission level did not return. */
  unavailable: string[];
  /** EarnRoom-side conversions, kept clearly separate from platform metrics. */
  attributedConversions: { name: string; value: number | null }[];
};

/**
 * Retrieves genuine Instagram media insights through the official API. A
 * metric Instagram does not return is reported as unavailable, never guessed,
 * and platform metrics are never mixed with EarnRoom attribution.
 */
export const getInstagramInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ mediaId: z.string().min(3).max(64) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<InstagramInsightsResult> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const empty = (detail: string): InstagramInsightsResult => ({
      ok: false,
      detail,
      platformMetrics: [],
      unavailable: [],
      attributedConversions: [],
    });
    const stored = await readInstagramToken();
    if (!stored.token) return empty(stored.detail);

    const { fetchInstagramMediaInsights } = await import("@/lib/marketing/instagram-login");
    const result = await fetchInstagramMediaInsights(fetch, {
      mediaId: data.mediaId,
      accessToken: stored.token,
    });
    if (!result.ok) return empty(`${result.state}: ${result.error}`);

    // EarnRoom-attributed outcomes come from EarnRoom's own records, never
    // from Instagram, and are labelled separately in the console.
    const { data: publication } = await supabase
      .from("marketing_publications")
      .select("conversions")
      .eq("platform_post_id", data.mediaId)
      .maybeSingle();
    const conversions = (publication?.conversions ?? {}) as Record<string, unknown>;
    const attributed = [
      "siteVisits",
      "registrations",
      "listings",
      "enquiries",
      "bookings",
    ].map((name) => ({
      name,
      value: typeof conversions[name] === "number" ? (conversions[name] as number) : null,
    }));

    return {
      ok: true,
      detail: "Live figures from the Instagram API.",
      platformMetrics: Object.entries(result.value.metrics).map(([name, value]) => ({
        name,
        value,
      })),
      unavailable: result.value.unavailable,
      attributedConversions: attributed,
    };
  });
