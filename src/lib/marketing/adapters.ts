/**
 * Publishing channel adapter architecture.
 *
 * One interface per platform, so platform behaviour never leaks into the
 * marketing intelligence. Every adapter is built from a real connection
 * record; with no stored authorisation the adapter refuses honestly rather
 * than pretending. There is no simulated upload path anywhere in this file.
 *
 * Pure module: the HTTP call itself is injected, so adapters are testable and
 * carry no vendor SDK.
 */
import { capabilityFor, definition, type PlatformConnectionRecord } from "./platforms";
import { publishFacebookPageVideo } from "./meta";
import { publishInstagramLoginReel } from "./instagram-login";
import { publishYoutubeVideo } from "./youtube";
import { oauthDefinition } from "./oauth";
import type {
  MarketingCampaign,
  MarketingSettings,
  PlatformAsset,
  PlatformCapability,
  PlatformId,
  PublishResult,
} from "./types";

/** Everything an adapter is allowed to know. Never a client secret. */
export type AdapterContext = {
  connection: PlatformConnectionRecord | null;
  /** Present only when the founder completed OAuth for this platform. */
  accessToken: string | null;
  /** Platform account/page/channel the founder selected. */
  accountId: string | null;
  /**
   * Meta only: the Facebook Page access token that governs the selected Page
   * and its linked Instagram Professional account. A Meta user token cannot
   * publish to a Page, so Facebook/Instagram refuse without this.
   */
  pageAccessToken?: string | null;
  settings: MarketingSettings;
  connections: readonly PlatformConnectionRecord[];
  now: number;
  /** Injected transport, so tests never touch the network. */
  fetchImpl: typeof fetch;
  /** Injected delay, so processing polls can be exercised without waiting. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * YouTube only: the visibility the founder asked for. Defaults to `unlisted`
   * — real, on the real channel, but not pushed at an audience. YouTube itself
   * decides what it grants; the stored visibility is read back afterwards.
   */
  youtubePrivacy?: "private" | "unlisted" | "public";
  /**
   * The founder-chosen destination WITHIN the connected account: the Pinterest
   * board, or the LinkedIn author (member or organisation URN). Never guessed.
   */
  destinationId?: string | null;
  /** TikTok only: the privacy level the founder asked for, if any. */
  tiktokPrivacy?: string | null;
  /** Pinterest only: a cover belonging to the exact video being pinned. */
  coverImageUrl?: string | null;
};

export interface PublishingChannelAdapter {
  platform: PlatformId;
  capability(): PlatformCapability;
  /** Format, duration and copy checks the platform itself imposes. */
  validateAsset(asset: PlatformAsset): { ok: boolean; problems: string[] };
  upload(asset: PlatformAsset, campaign: MarketingCampaign): Promise<PublishResult>;
  publish(asset: PlatformAsset, campaign: MarketingCampaign): Promise<PublishResult>;
  getPublicationStatus(platformPostId: string): Promise<{ state: string; url: string | null }>;
  getAnalytics(platformPostId: string): Promise<Record<string, number> | null>;
}

const TITLE_LIMIT: Record<PlatformId, number> = {
  youtube: 100,
  youtube_shorts: 100,
  instagram: 125,
  tiktok: 150,
  facebook: 255,
  linkedin: 200,
  pinterest: 100,
};

export function validateAssetForPlatform(asset: PlatformAsset): {
  ok: boolean;
  problems: string[];
} {
  const def = definition(asset.platform);
  const problems: string[] = [];
  if (!def.aspects.includes(asset.aspect)) {
    problems.push(`${def.label} does not accept ${asset.aspect}; use ${def.aspects.join(" or ")}.`);
  }
  if (asset.seconds > def.maxSeconds) {
    problems.push(`${asset.seconds}s exceeds the ${def.maxSeconds}s ${def.label} limit.`);
  }
  const limit = TITLE_LIMIT[asset.platform];
  if (asset.title.length > limit) {
    problems.push(`Title is ${asset.title.length} characters; ${def.label} allows ${limit}.`);
  }
  if (!asset.videoUrl) {
    problems.push("No rendered video file exists for this asset yet.");
  }
  return { ok: problems.length === 0, problems };
}

function refusal(state: PublishResult extends { ok: false } ? never : never): never {
  throw new Error(String(state));
}
void refusal;

/**
 * The adapter used whenever a platform has no usable authorisation. It states
 * exactly what is missing and never returns a published state.
 */
export function unavailableAdapter(
  platform: PlatformId,
  context: AdapterContext,
  reason: string,
): PublishingChannelAdapter {
  const blocked = async (): Promise<PublishResult> => ({
    ok: false,
    state: "AUTH_REQUIRED",
    error: reason,
    retryable: true,
  });
  return {
    platform,
    capability: () => capabilityFor(platform, context.connections, context.settings, context.now),
    validateAsset: validateAssetForPlatform,
    upload: blocked,
    publish: blocked,
    getPublicationStatus: async () => ({ state: "UNKNOWN", url: null }),
    getAnalytics: async () => null,
  };
}

/**
 * The connected YouTube channel, through the official YouTube Data API v3
 * resumable upload. Shorts are the same channel and the same authorisation,
 * validated against the Shorts shape and length limits.
 */
function youtubeAdapter(
  platform: "youtube" | "youtube_shorts",
  context: AdapterContext,
  capability: PlatformCapability,
  accessToken: string,
): PublishingChannelAdapter {
  const call = async (
    asset: PlatformAsset,
    _campaign: MarketingCampaign,
  ): Promise<PublishResult> => {
    void _campaign;
    const check = validateAssetForPlatform(asset);
    if (!check.ok) {
      return {
        ok: false,
        state: "VALIDATION_FAILED",
        error: check.problems.join(" "),
        retryable: false,
      };
    }
    if (!asset.videoUrl) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: "No rendered video file is available to upload to YouTube.",
        retryable: true,
      };
    }
    return publishYoutubeVideo({
      fetchImpl: context.fetchImpl,
      accessToken,
      videoUrl: asset.videoUrl,
      title: asset.title,
      description: asset.description,
      tags: asset.hashtags,
      privacyStatus: context.youtubePrivacy ?? "unlisted",
      now: context.now,
    });
  };

  return {
    platform,
    capability: () => capability,
    validateAsset: validateAssetForPlatform,
    upload: call,
    publish: call,
    getPublicationStatus: async (platformPostId) => ({
      state: "PUBLISHED",
      url: `https://www.youtube.com/watch?v=${platformPostId}`,
    }),
    getAnalytics: async () => null,
  };
}

/**
 * Facebook Pages and Instagram Professional accounts, through the official
 * Meta Graph API. Both use the Page access token — never the Meta user token,
 * and never the Meta user id as the destination.
 */
function metaAdapter(
  platform: "facebook" | "instagram",
  context: AdapterContext,
  capability: PlatformCapability,
  accountId: string,
): PublishingChannelAdapter {
  /*
   * Facebook publishes with the PAGE token. Instagram uses Instagram Login and
   * publishes with the INSTAGRAM USER token — it has no Facebook Page
   * dependency at all.
   */
  const pageToken = context.pageAccessToken ?? null;
  const instagramToken = context.accessToken ?? null;
  if (platform === "facebook" && !pageToken) {
    return unavailableAdapter(
      platform,
      context,
      "Connected, but no Facebook Page has been selected. Choose the Page to publish to.",
    );
  }
  if (platform === "instagram" && !instagramToken) {
    return unavailableAdapter(
      platform,
      context,
      "Instagram is not authorised. Connect the Instagram professional account.",
    );
  }

  const call = async (
    asset: PlatformAsset,
    _campaign: MarketingCampaign,
  ): Promise<PublishResult> => {
    void _campaign;
    const check = validateAssetForPlatform(asset);
    if (!check.ok) {
      return {
        ok: false,
        state: "VALIDATION_FAILED",
        error: check.problems.join(" "),
        retryable: false,
      };
    }
    if (!asset.videoUrl) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: "No media link is available for Meta to fetch this video from.",
        retryable: true,
      };
    }
    if (platform === "facebook") {
      return publishFacebookPageVideo({
        fetchImpl: context.fetchImpl,
        pageId: accountId,
        pageAccessToken: pageToken as string,
        videoUrl: asset.videoUrl,
        description: asset.description,
        title: asset.title,
        now: context.now,
      });
    }
    return publishInstagramLoginReel({
      fetchImpl: context.fetchImpl,
      instagramAccountId: accountId,
      accessToken: instagramToken as string,
      videoUrl: asset.videoUrl,
      caption: asset.caption,
      now: context.now,
      ...(context.sleep ? { sleep: context.sleep } : {}),
    });
  };

  return {
    platform,
    capability: () => capability,
    validateAsset: validateAssetForPlatform,
    upload: call,
    publish: call,
    getPublicationStatus: async (platformPostId) => ({
      state: "PUBLISHED",
      url:
        platform === "facebook"
          ? `https://www.facebook.com/${accountId}/videos/${platformPostId}`
          : null,
    }),
    getAnalytics: async () => null,
  };
}

/** A platform endpoint description: what a real publish would call. */
type Endpoint = {
  uploadUrl: (accountId: string) => string;
  body: (asset: PlatformAsset, campaign: MarketingCampaign, accountId: string) => unknown;
  postIdFrom: (payload: Record<string, unknown>) => string | null;
  urlFor: (postId: string, accountId: string) => string | null;
  analyticsUrl: ((postId: string) => string) | null;
};

const ENDPOINTS: Partial<Record<PlatformId, Endpoint>> = {
  youtube: {
    uploadUrl: () =>
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    body: (asset) => ({
      snippet: { title: asset.title, description: asset.description, tags: asset.hashtags },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
    }),
    postIdFrom: (payload) => (typeof payload["id"] === "string" ? payload["id"] : null),
    urlFor: (postId) => `https://www.youtube.com/watch?v=${postId}`,
    analyticsUrl: (postId) =>
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${postId}`,
  },
  facebook: {
    uploadUrl: (accountId) => `https://graph.facebook.com/v21.0/${accountId}/videos`,
    body: (asset) => ({ description: asset.description, file_url: asset.videoUrl }),
    postIdFrom: (payload) => (typeof payload["id"] === "string" ? payload["id"] : null),
    urlFor: (postId) => `https://www.facebook.com/${postId}`,
    analyticsUrl: (postId) =>
      `https://graph.facebook.com/v21.0/${postId}/video_insights?metric=total_video_views`,
  },
  instagram: {
    uploadUrl: (accountId) => `https://graph.facebook.com/v21.0/${accountId}/media`,
    body: (asset) => ({ media_type: "REELS", video_url: asset.videoUrl, caption: asset.caption }),
    postIdFrom: (payload) => (typeof payload["id"] === "string" ? payload["id"] : null),
    urlFor: () => null,
    analyticsUrl: (postId) => `https://graph.facebook.com/v21.0/${postId}/insights?metric=reach`,
  },
  tiktok: {
    uploadUrl: () => "https://open.tiktokapis.com/v2/post/publish/video/init/",
    body: (asset) => ({
      post_info: { title: asset.title, privacy_level: "SELF_ONLY" },
      source_info: { source: "PULL_FROM_URL", video_url: asset.videoUrl },
    }),
    postIdFrom: (payload) => {
      const data = payload["data"];
      if (data && typeof data === "object" && "publish_id" in data) {
        const id = (data as Record<string, unknown>)["publish_id"];
        return typeof id === "string" ? id : null;
      }
      return null;
    },
    urlFor: () => null,
    analyticsUrl: null,
  },
  linkedin: {
    uploadUrl: () => "https://api.linkedin.com/rest/posts",
    body: (asset, _campaign, accountId) => ({
      author: `urn:li:organization:${accountId}`,
      commentary: asset.description,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED",
    }),
    postIdFrom: (payload) => (typeof payload["id"] === "string" ? payload["id"] : null),
    urlFor: (postId) => `https://www.linkedin.com/feed/update/${postId}`,
    analyticsUrl: null,
  },
  pinterest: {
    uploadUrl: () => "https://api.pinterest.com/v5/pins",
    body: (asset, _campaign, accountId) => ({
      board_id: accountId,
      title: asset.title,
      description: asset.description,
      link: "https://earnroom.co.uk",
    }),
    postIdFrom: (payload) => (typeof payload["id"] === "string" ? payload["id"] : null),
    urlFor: (postId) => `https://www.pinterest.com/pin/${postId}/`,
    analyticsUrl: (postId) => `https://api.pinterest.com/v5/pins/${postId}/analytics`,
  },
};

/**
 * Builds the adapter for a platform. Returns an honest refusing adapter unless
 * a real connection, access token and account are present.
 */
export function adapterFor(
  platform: PlatformId,
  context: AdapterContext,
): PublishingChannelAdapter {
  const def = definition(platform);
  const capability = capabilityFor(platform, context.connections, context.settings, context.now);

  if (capability.paused) {
    return unavailableAdapter(platform, context, "Publishing is paused for this platform.");
  }
  if (capability.connection !== "CONNECTED") {
    return unavailableAdapter(platform, context, capability.reason);
  }
  if (!context.accessToken || !context.accountId) {
    return unavailableAdapter(
      platform,
      context,
      "Connected, but no usable authorisation token or destination account is stored.",
    );
  }
  const endpointKey: PlatformId = platform === "youtube_shorts" ? "youtube" : platform;
  const endpoint = ENDPOINTS[endpointKey];
  if (!endpoint) {
    return unavailableAdapter(
      platform,
      context,
      `${def.label} publishing is not supported by the official API configuration yet.`,
    );
  }
  if (platform === "tiktok" && !oauthDefinition("tiktok").approvalNote) {
    return unavailableAdapter(platform, context, "TikTok approval state unknown.");
  }

  const token = context.accessToken;
  const accountId = context.accountId;

  // Meta needs its own multi-step flows: a Facebook Page publish must use the
  // Page access token, and an Instagram publish is only real after
  // media_publish returns an id. Both live in the Meta module.
  if (platform === "facebook" || platform === "instagram") {
    return metaAdapter(platform, context, capability, accountId);
  }

  // YouTube is a two-step resumable upload: a JSON request only opens the
  // session, so the file bytes must actually be sent before anything may be
  // called published. Shorts use the same channel and the same upload.
  if (platform === "youtube" || platform === "youtube_shorts") {
    return youtubeAdapter(platform, context, capability, token);
  }

  const call = async (
    asset: PlatformAsset,
    campaign: MarketingCampaign,
  ): Promise<PublishResult> => {
    const check = validateAssetForPlatform(asset);
    if (!check.ok) {
      return {
        ok: false,
        state: "VALIDATION_FAILED",
        error: check.problems.join(" "),
        retryable: false,
      };
    }
    let response: Response;
    try {
      response = await context.fetchImpl(endpoint.uploadUrl(accountId), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(endpoint.body(asset, campaign, accountId)),
      });
    } catch (error) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: error instanceof Error ? error.message : "The upload request failed.",
        retryable: true,
      };
    }
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        state: "AUTH_REQUIRED",
        error: `${def.label} rejected the stored authorisation. Reconnect the account.`,
        retryable: true,
      };
    }
    if (!response.ok) {
      const message =
        typeof payload["error"] === "string"
          ? payload["error"]
          : `${def.label} rejected the upload (HTTP ${response.status}).`;
      return {
        ok: false,
        state: response.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
        error: message,
        retryable: response.status >= 500 || response.status === 429,
      };
    }
    const postId = endpoint.postIdFrom(payload);
    if (!postId) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: `${def.label} accepted the request but returned no post identifier.`,
        retryable: true,
      };
    }
    return {
      ok: true,
      platformPostId: postId,
      platformUrl: endpoint.urlFor(postId, accountId),
      publishedAt: context.now,
    };
  };

  return {
    platform,
    capability: () => capability,
    validateAsset: validateAssetForPlatform,
    upload: call,
    publish: call,
    getPublicationStatus: async (platformPostId) => ({
      state: "PUBLISHED",
      url: endpoint.urlFor(platformPostId, accountId),
    }),
    getAnalytics: async (platformPostId) => {
      if (!endpoint.analyticsUrl) return null;
      const response = await context.fetchImpl(endpoint.analyticsUrl(platformPostId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const flat: Record<string, number> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === "number") flat[key] = value;
      }
      return flat;
    },
  };
}
