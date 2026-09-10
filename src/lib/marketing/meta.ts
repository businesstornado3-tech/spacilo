/**
 * Meta (Facebook Page + Instagram Professional) official Graph API layer.
 *
 * Pure module: every network call is injected, so this is fully testable and
 * carries no vendor SDK. It knows nothing about secrets — it is handed a token
 * that the server has already decrypted, and it never returns one.
 *
 * Two rules are absolute here:
 *   1. A Facebook Page publish uses the PAGE access token, never the Meta user
 *      token, and never the Meta user id as the destination account.
 *   2. An Instagram publish is only complete after `media_publish` returns a
 *      real media id. A container id is never treated as a publication.
 *
 * The Graph version matches the version the existing OAuth definitions already
 * use (v21.0); it is deliberately not upgraded here.
 */
import type { PublishResult } from "./types";

export const META_GRAPH_VERSION = "v21.0";

export function graphUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** A Facebook Page the connected Meta user can manage. */
export type MetaPage = {
  id: string;
  name: string;
  /** Page access token — encrypted before storage, never sent to a browser. */
  accessToken: string;
  category: string | null;
  /** True when the granted tasks allow publishing content to the Page. */
  canPublish: boolean;
};

export type MetaInstagramAccount = {
  id: string;
  username: string | null;
  name: string | null;
};

export type MetaResult<T> =
  { ok: true; value: T } | { ok: false; error: string; retryable: boolean };

const TOKEN_LIKE = /\b(EAA|IGQ|GHA)[A-Za-z0-9_-]{12,}\b/g;

/**
 * Turns a Meta error payload into one plain sentence that can safely be shown
 * to the founder. Never carries a token, secret, code or trace identifier.
 */
export function sanitiseMetaError(payload: unknown, fallback: string): string {
  const error = (payload as { error?: Record<string, unknown> } | null)?.error;
  const raw =
    error && typeof error["message"] === "string" ? (error["message"] as string) : fallback;
  return raw
    .replace(TOKEN_LIKE, "[redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * A transport failure never reached Meta at all. The runtime reason is kept
 * verbatim (it separates a worker-runtime fault from DNS/network), so the
 * console never has to describe a real fault as an unknown one.
 */
export function metaTransportDetail(stage: string, error: unknown): string {
  const reason =
    error instanceof Error && error.message
      ? error.message.replace(/\s+/g, " ").slice(0, 160)
      : "no error detail was reported by the runtime";
  return `${stage}: the request to Meta was not completed (${reason}). Meta never received it.`;
}

function transportFailure(
  error: unknown,
  stage = "META_REQUEST",
): { ok: false; error: string; retryable: true } {
  return { ok: false, error: metaTransportDetail(stage, error), retryable: true };
}

/* --------------------------------------------------------- page discovery */

/**
 * `/me/accounts` — the Pages this Meta user manages, with their Page tokens.
 * Uses only the permissions the existing OAuth definition already requests.
 */
export async function discoverPages(
  fetchImpl: typeof fetch,
  userAccessToken: string,
): Promise<MetaResult<MetaPage[]>> {
  let response: Response;
  try {
    response = await fetchImpl(
      graphUrl("me/accounts", { fields: "id,name,category,access_token,tasks", limit: "50" }),
      { headers: { Authorization: `Bearer ${userAccessToken}` } },
    );
  } catch (error) {
    return transportFailure(error);
  }
  const payload = await readJson(response);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: sanitiseMetaError(
        payload,
        "Meta rejected the stored authorisation. Reconnect the Meta account.",
      ),
      retryable: true,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: sanitiseMetaError(payload, `Meta refused the request (HTTP ${response.status}).`),
      retryable: response.status >= 500 || response.status === 429,
    };
  }
  const rows = Array.isArray(payload["data"]) ? (payload["data"] as Record<string, unknown>[]) : [];
  const pages: MetaPage[] = [];
  for (const row of rows) {
    const id = typeof row["id"] === "string" ? row["id"] : null;
    const token = typeof row["access_token"] === "string" ? row["access_token"] : null;
    if (!id || !token) continue;
    const tasks = Array.isArray(row["tasks"]) ? (row["tasks"] as unknown[]).map(String) : [];
    pages.push({
      id,
      name: typeof row["name"] === "string" ? row["name"] : "Untitled Page",
      accessToken: token,
      category: typeof row["category"] === "string" ? row["category"] : null,
      // Meta omits `tasks` for some app configurations; absence is not a refusal.
      canPublish:
        tasks.length === 0 || tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE"),
    });
  }
  return { ok: true, value: pages };
}

/* ---------------------------------------------- instagram account discovery */

/**
 * The Instagram Professional account linked to a Facebook Page, if there is
 * one. A missing link is a legitimate answer (`null`), not an error, and a
 * personal Instagram account never appears here — Meta only returns
 * professional accounts on this edge.
 */
export async function discoverInstagramAccount(
  fetchImpl: typeof fetch,
  pageId: string,
  pageAccessToken: string,
): Promise<MetaResult<MetaInstagramAccount | null>> {
  let response: Response;
  try {
    response = await fetchImpl(
      graphUrl(pageId, { fields: "instagram_business_account{id,username,name}" }),
      { headers: { Authorization: `Bearer ${pageAccessToken}` } },
    );
  } catch (error) {
    return transportFailure(error);
  }
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      error: sanitiseMetaError(
        payload,
        `Meta refused the Instagram lookup (HTTP ${response.status}).`,
      ),
      retryable: response.status >= 500 || response.status === 429,
    };
  }
  const linked = payload["instagram_business_account"] as Record<string, unknown> | undefined;
  const id = linked && typeof linked["id"] === "string" ? (linked["id"] as string) : null;
  if (!id) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      id,
      username: typeof linked?.["username"] === "string" ? (linked["username"] as string) : null,
      name: typeof linked?.["name"] === "string" ? (linked["name"] as string) : null,
    },
  };
}

/* ------------------------------------------------------ facebook publishing */

export type FacebookPublishInput = {
  fetchImpl: typeof fetch;
  pageId: string;
  /** Page token — required. A user token cannot publish to a Page. */
  pageAccessToken: string;
  /** Temporary, narrowly scoped media URL Meta's servers can fetch. */
  videoUrl: string;
  description: string;
  title?: string;
  now: number;
};

/** Publishes a video to a Facebook Page using the Page access token. */
export async function publishFacebookPageVideo(
  input: FacebookPublishInput,
): Promise<PublishResult> {
  const body: Record<string, string> = {
    file_url: input.videoUrl,
    description: input.description,
    access_token: input.pageAccessToken,
  };
  if (input.title) body["title"] = input.title;

  let response: Response;
  try {
    response = await input.fetchImpl(graphUrl(`${input.pageId}/videos`), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    const failure = transportFailure(error, "FACEBOOK_PAGE_VIDEO");
    return { ok: false, state: "UPLOAD_FAILED", error: failure.error, retryable: true };
  }
  const payload = await readJson(response);
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      state: "AUTH_REQUIRED",
      error: sanitiseMetaError(
        payload,
        "Facebook rejected the stored Page authorisation. Reconnect the Meta account.",
      ),
      retryable: true,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      state: response.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: sanitiseMetaError(payload, `Facebook rejected the upload (HTTP ${response.status}).`),
      retryable: response.status >= 500 || response.status === 429,
    };
  }
  const videoId = typeof payload["id"] === "string" ? (payload["id"] as string) : null;
  if (!videoId) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "Facebook accepted the request but returned no video identifier.",
      retryable: true,
    };
  }
  return {
    ok: true,
    platformPostId: videoId,
    platformUrl: `https://www.facebook.com/${input.pageId}/videos/${videoId}`,
    publishedAt: input.now,
  };
}

/* ----------------------------------------------------- instagram publishing */

export type InstagramPublishInput = {
  fetchImpl: typeof fetch;
  /** Instagram Professional account id — never a Page id or a user id. */
  instagramAccountId: string;
  /** Page token that governs the linked Instagram account. */
  pageAccessToken: string;
  videoUrl: string;
  caption: string;
  now: number;
  /** Container processing poll settings. */
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The complete Instagram Reels flow: create container → poll processing →
 * media_publish → read permalink. Only the id returned by `media_publish` is
 * treated as the published media id.
 */
export async function publishInstagramReel(input: InstagramPublishInput): Promise<PublishResult> {
  const sleep = input.sleep ?? defaultSleep;
  const interval = input.pollIntervalMs ?? 5_000;
  const attempts = input.maxPollAttempts ?? 24;

  /* 1. Container */
  let containerResponse: Response;
  try {
    containerResponse = await input.fetchImpl(graphUrl(`${input.instagramAccountId}/media`), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: input.videoUrl,
        caption: input.caption,
        access_token: input.pageAccessToken,
      }).toString(),
    });
  } catch (error) {
    const failure = transportFailure(error);
    return { ok: false, state: "UPLOAD_FAILED", error: failure.error, retryable: true };
  }
  const containerPayload = await readJson(containerResponse);
  if (containerResponse.status === 401 || containerResponse.status === 403) {
    return {
      ok: false,
      state: "AUTH_REQUIRED",
      error: sanitiseMetaError(
        containerPayload,
        "Instagram rejected the stored authorisation. Reconnect the Meta account.",
      ),
      retryable: true,
    };
  }
  if (!containerResponse.ok) {
    return {
      ok: false,
      state: containerResponse.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: sanitiseMetaError(
        containerPayload,
        `Instagram refused the media container (HTTP ${containerResponse.status}).`,
      ),
      retryable: containerResponse.status >= 500 || containerResponse.status === 429,
    };
  }
  const containerId =
    typeof containerPayload["id"] === "string" ? (containerPayload["id"] as string) : null;
  if (!containerId) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "Instagram accepted the request but returned no media container.",
      retryable: true,
    };
  }

  /* 2. Processing */
  let ready = false;
  let lastStatus = "IN_PROGRESS";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let statusResponse: Response;
    try {
      statusResponse = await input.fetchImpl(
        graphUrl(containerId, {
          fields: "status_code,status",
          access_token: input.pageAccessToken,
        }),
      );
    } catch (error) {
      const failure = transportFailure(error);
      return { ok: false, state: "UPLOAD_FAILED", error: failure.error, retryable: true };
    }
    const statusPayload = await readJson(statusResponse);
    lastStatus =
      typeof statusPayload["status_code"] === "string"
        ? (statusPayload["status_code"] as string)
        : lastStatus;
    if (lastStatus === "FINISHED") {
      ready = true;
      break;
    }
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
      return {
        ok: false,
        state: "PLATFORM_REJECTED",
        error: sanitiseMetaError(
          statusPayload,
          lastStatus === "EXPIRED"
            ? "Instagram could not fetch the video before the media link expired."
            : "Instagram could not process the video file.",
        ),
        retryable: lastStatus === "EXPIRED",
      };
    }
    await sleep(interval);
  }
  if (!ready) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "Instagram is still processing the video. Nothing was published; try again shortly.",
      retryable: true,
    };
  }

  /* 3. Publish — the only step that produces a real media id */
  let publishResponse: Response;
  try {
    publishResponse = await input.fetchImpl(graphUrl(`${input.instagramAccountId}/media_publish`), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: input.pageAccessToken,
      }).toString(),
    });
  } catch (error) {
    const failure = transportFailure(error);
    return { ok: false, state: "UPLOAD_FAILED", error: failure.error, retryable: true };
  }
  const publishPayload = await readJson(publishResponse);
  if (!publishResponse.ok) {
    return {
      ok: false,
      state: publishResponse.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: sanitiseMetaError(
        publishPayload,
        `Instagram refused to publish the media (HTTP ${publishResponse.status}).`,
      ),
      retryable: publishResponse.status >= 500 || publishResponse.status === 429,
    };
  }
  const mediaId =
    typeof publishPayload["id"] === "string" ? (publishPayload["id"] as string) : null;
  if (!mediaId || mediaId === containerId) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "Instagram did not return a published media identifier.",
      retryable: true,
    };
  }

  /* 4. Permalink — best effort; a missing permalink never blocks the result */
  let permalink: string | null = null;
  try {
    const permaResponse = await input.fetchImpl(
      graphUrl(mediaId, { fields: "permalink", access_token: input.pageAccessToken }),
    );
    if (permaResponse.ok) {
      const permaPayload = await readJson(permaResponse);
      permalink =
        typeof permaPayload["permalink"] === "string"
          ? (permaPayload["permalink"] as string)
          : null;
    }
  } catch {
    permalink = null;
  }

  return {
    ok: true,
    platformPostId: mediaId,
    platformUrl: permalink,
    publishedAt: input.now,
  };
}

/* ---------------------------------------------------------- console status */

export type MetaStatusInput = {
  platform: "facebook" | "instagram";
  configured: boolean;
  connected: boolean;
  expired: boolean;
  paused: boolean;
  pageSelected: boolean;
  /** Instagram only: a Professional account was found for the selected Page. */
  instagramFound: boolean;
  lastError: string | null;
  /** True once Meta has confirmed at least one real publication. */
  publishedBefore: boolean;
};

export type MetaStatusWord =
  | "NOT CONNECTED"
  | "CONFIGURATION REQUIRED"
  | "AUTHORIZATION REQUIRED"
  | "CONNECTED — PAGE SELECTION REQUIRED"
  | "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND"
  | "PUBLISHING PAUSED"
  | "LAST ATTEMPT FAILED"
  | "CONNECTED";

/** The exact Founder Console status word for a Meta platform. */
export function metaStatusWord(input: MetaStatusInput): MetaStatusWord {
  if (!input.configured) return "CONFIGURATION REQUIRED";
  if (!input.connected) return "NOT CONNECTED";
  if (input.expired) return "AUTHORIZATION REQUIRED";
  if (!input.pageSelected) return "CONNECTED — PAGE SELECTION REQUIRED";
  if (input.platform === "instagram" && !input.instagramFound) {
    return "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND";
  }
  if (input.paused) return "PUBLISHING PAUSED";
  if (input.lastError) return "LAST ATTEMPT FAILED";
  return "CONNECTED";
}

/** Plain-language line under the status word. Never mentions a token. */
export function metaStatusDetail(input: MetaStatusInput): string {
  switch (metaStatusWord(input)) {
    case "CONFIGURATION REQUIRED":
      return "The Meta application credentials are not set up on the server yet.";
    case "NOT CONNECTED":
      return "Connect Meta to publish to your Facebook Page and Instagram Professional account.";
    case "AUTHORIZATION REQUIRED":
      return "The Meta authorisation has expired. Reconnect the account.";
    case "CONNECTED — PAGE SELECTION REQUIRED":
      return "Choose which Facebook Page EarnRoom should publish to.";
    case "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND":
      return "Instagram Professional account not found for this Facebook Page.";
    case "PUBLISHING PAUSED":
      return "Connected. Publishing to this platform is switched off.";
    case "LAST ATTEMPT FAILED":
      return input.lastError ?? "The last attempt failed.";
    default:
      return input.publishedBefore
        ? "Connected and confirmed by Meta."
        : "Connected. No publication has been confirmed by Meta yet.";
  }
}
