/**
 * Instagram API with Instagram Login — official Meta implementation.
 *
 * This is the connection model Meta now uses for Instagram professional
 * accounts: the founder signs in on Instagram itself, Meta returns an
 * INSTAGRAM USER access token, and every call goes to `graph.instagram.com`
 * with that token. There is no Facebook Page prerequisite and no Page token
 * anywhere in this file.
 *
 * Pure module: every network call is injected, so it is fully testable and
 * carries no vendor SDK. It never receives an app secret except where Meta's
 * own token endpoints require it, and it never returns a token in an error.
 *
 * Absolute rule, unchanged from the previous Meta layer: a container id is
 * NEVER a publication. Only the id returned by `media_publish` counts.
 */
import type { PublishResult } from "./types";

export const INSTAGRAM_GRAPH_VERSION = "v21.0";
export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";

/**
 * Only the permissions EarnRoom's implemented functionality needs. Comment and
 * message permissions are granted on the Meta app but deliberately NOT
 * requested here, because no governed comment/messaging workflow exists yet.
 */
export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export function instagramGraphUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/** Every failure state the Instagram layer can report. Never a success word. */
export type InstagramErrorState =
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "INVALID_SCOPE"
  | "PERMISSION_DENIED"
  | "ACCOUNT_NOT_FOUND"
  | "MEDIA_INVALID"
  | "MEDIA_PROCESSING"
  | "MEDIA_PROCESSING_TIMEOUT"
  | "PLATFORM_REJECTED"
  | "RATE_LIMITED"
  | "UPLOAD_FAILED"
  | "PUBLISH_FAILED";

export type InstagramResult<T> =
  | { ok: true; value: T }
  | { ok: false; state: InstagramErrorState; error: string; retryable: boolean };

const TOKEN_LIKE = /\b(EAA|IGQ|IGA|GHA)[A-Za-z0-9_.-]{12,}\b/g;

/** One plain sentence, safe for the founder console. Never carries a token. */
export function sanitiseInstagramError(payload: unknown, fallback: string): string {
  const record = payload as Record<string, unknown> | null;
  const nested = record?.["error"] as Record<string, unknown> | undefined;
  const raw =
    (nested && typeof nested["message"] === "string" && (nested["message"] as string)) ||
    (typeof record?.["error_message"] === "string" && (record["error_message"] as string)) ||
    (typeof record?.["error_description"] === "string" &&
      (record["error_description"] as string)) ||
    fallback;
  return String(raw)
    .replace(TOKEN_LIKE, "[redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Maps an HTTP status and Meta error payload onto an EarnRoom failure state. */
export function instagramErrorState(
  status: number,
  payload: unknown,
): { state: InstagramErrorState; retryable: boolean } {
  const error = (payload as { error?: Record<string, unknown> } | null)?.error;
  const code = typeof error?.["code"] === "number" ? (error["code"] as number) : null;
  const subcode =
    typeof error?.["error_subcode"] === "number" ? (error["error_subcode"] as number) : null;

  if (status === 429 || code === 4 || code === 17 || code === 613) {
    return { state: "RATE_LIMITED", retryable: true };
  }
  if (code === 190 && (subcode === 463 || subcode === 467)) {
    return { state: "TOKEN_EXPIRED", retryable: false };
  }
  if (status === 401 || code === 190) return { state: "AUTH_REQUIRED", retryable: false };
  if (code === 10 || code === 200 || code === 803) {
    return { state: "PERMISSION_DENIED", retryable: false };
  }
  if (status === 403) return { state: "PERMISSION_DENIED", retryable: false };
  if (status === 404) return { state: "ACCOUNT_NOT_FOUND", retryable: false };
  if (status >= 500) return { state: "UPLOAD_FAILED", retryable: true };
  return { state: "PLATFORM_REJECTED", retryable: false };
}

/**
 * Maps a detailed Instagram failure onto the EXISTING publication state
 * machine. The state machine is not extended: the precise Instagram reason is
 * carried in the message, and no failure can ever become PUBLISHED.
 */
export function publicationStateFor(
  state: InstagramErrorState,
): "AUTH_REQUIRED" | "VALIDATION_FAILED" | "UPLOAD_FAILED" | "PLATFORM_REJECTED" {
  switch (state) {
    case "AUTH_REQUIRED":
    case "TOKEN_EXPIRED":
    case "INVALID_SCOPE":
    case "PERMISSION_DENIED":
    case "ACCOUNT_NOT_FOUND":
      return "AUTH_REQUIRED";
    case "MEDIA_INVALID":
      return "VALIDATION_FAILED";
    case "PLATFORM_REJECTED":
      return "PLATFORM_REJECTED";
    default:
      return "UPLOAD_FAILED";
  }
}

/**
 * A transport failure never reached Instagram at all. The exact runtime reason
 * is kept (it distinguishes a worker-runtime fault from DNS/network), and the
 * publishing stage is named so the console does not have to guess.
 */
export function instagramTransportDetail(stage: string, error: unknown): string {
  const reason =
    error instanceof Error && error.message
      ? error.message.replace(/\s+/g, " ").slice(0, 160)
      : "no error detail was reported by the runtime";
  return `${stage}: the request to Instagram was not completed (${reason}). Instagram never received it.`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function transport<T>(error: unknown, state: InstagramErrorState): InstagramResult<T> {
  return {
    ok: false,
    state,
    error:
      error instanceof Error && error.message
        ? `Could not reach Instagram (${error.message.slice(0, 120)}).`
        : "Could not reach Instagram.",
    retryable: true,
  };
}

/* -------------------------------------------------------------- token flow */

export type InstagramShortLivedToken = {
  accessToken: string;
  /** Instagram-scoped user id returned alongside the token. */
  userId: string | null;
  permissions: readonly string[];
};

/**
 * Step 1 — exchanges the authorisation code for a SHORT-LIVED Instagram user
 * access token at Meta's official Instagram token endpoint.
 */
export async function exchangeInstagramCode(
  fetchImpl: typeof fetch,
  input: { clientId: string; clientSecret: string; redirectUri: string; code: string },
): Promise<InstagramResult<InstagramShortLivedToken>> {
  let response: Response;
  try {
    response = await fetchImpl(INSTAGRAM_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
        code: input.code,
      }).toString(),
    });
  } catch (error) {
    return transport(error, "AUTH_REQUIRED");
  }
  const payload = await readJson(response);
  const accessToken =
    typeof payload["access_token"] === "string" ? (payload["access_token"] as string) : null;
  if (!response.ok || !accessToken) {
    const classified = instagramErrorState(response.status, payload);
    return {
      ok: false,
      state: classified.state,
      error: sanitiseInstagramError(
        payload,
        `Instagram did not return an authorisation (HTTP ${response.status}).`,
      ),
      retryable: classified.retryable,
    };
  }
  const rawUserId = payload["user_id"];
  const permissions = Array.isArray(payload["permissions"])
    ? (payload["permissions"] as unknown[]).map(String)
    : typeof payload["permissions"] === "string"
      ? (payload["permissions"] as string).split(",").filter(Boolean)
      : [];
  return {
    ok: true,
    value: {
      accessToken,
      userId:
        typeof rawUserId === "string" || typeof rawUserId === "number" ? String(rawUserId) : null,
      permissions,
    },
  };
}

export type InstagramLongLivedToken = { accessToken: string; expiresInSeconds: number | null };

/**
 * Step 2 — exchanges the short-lived token for the 60-day long-lived Instagram
 * user access token. Only the long-lived token is ever stored.
 */
export async function exchangeInstagramLongLivedToken(
  fetchImpl: typeof fetch,
  input: { clientSecret: string; accessToken: string },
): Promise<InstagramResult<InstagramLongLivedToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_HOST}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", input.clientSecret);
  url.searchParams.set("access_token", input.accessToken);
  let response: Response;
  try {
    response = await fetchImpl(url.toString());
  } catch (error) {
    return transport(error, "AUTH_REQUIRED");
  }
  const payload = await readJson(response);
  const accessToken =
    typeof payload["access_token"] === "string" ? (payload["access_token"] as string) : null;
  if (!response.ok || !accessToken) {
    const classified = instagramErrorState(response.status, payload);
    return {
      ok: false,
      state: classified.state,
      error: sanitiseInstagramError(
        payload,
        "Instagram would not issue a long-lived authorisation.",
      ),
      retryable: classified.retryable,
    };
  }
  return {
    ok: true,
    value: {
      accessToken,
      expiresInSeconds:
        typeof payload["expires_in"] === "number" ? (payload["expires_in"] as number) : null,
    },
  };
}

/** Refreshes a long-lived token that is at least 24 hours old. */
export async function refreshInstagramToken(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<InstagramResult<InstagramLongLivedToken>> {
  const url = new URL(`${INSTAGRAM_GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  let response: Response;
  try {
    response = await fetchImpl(url.toString());
  } catch (error) {
    return transport(error, "TOKEN_EXPIRED");
  }
  const payload = await readJson(response);
  const refreshed =
    typeof payload["access_token"] === "string" ? (payload["access_token"] as string) : null;
  if (!response.ok || !refreshed) {
    const classified = instagramErrorState(response.status, payload);
    return {
      ok: false,
      state: classified.state,
      error: sanitiseInstagramError(payload, "Instagram would not refresh the authorisation."),
      retryable: classified.retryable,
    };
  }
  return {
    ok: true,
    value: {
      accessToken: refreshed,
      expiresInSeconds:
        typeof payload["expires_in"] === "number" ? (payload["expires_in"] as number) : null,
    },
  };
}

/* ---------------------------------------------------------- account lookup */

export type InstagramAccount = {
  /** Instagram professional account id used for publishing. */
  id: string;
  username: string | null;
  name: string | null;
  accountType: string | null;
};

/**
 * `/me` on the Instagram Graph host. Returns only safe display metadata; no
 * personal data beyond the account's own public identity is requested.
 */
export async function fetchInstagramAccount(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<InstagramResult<InstagramAccount>> {
  let response: Response;
  try {
    response = await fetchImpl(
      instagramGraphUrl("me", {
        fields: "user_id,username,name,account_type",
        access_token: accessToken,
      }),
    );
  } catch (error) {
    return transport(error, "ACCOUNT_NOT_FOUND");
  }
  const payload = await readJson(response);
  if (!response.ok) {
    const classified = instagramErrorState(response.status, payload);
    return {
      ok: false,
      state: classified.state,
      error: sanitiseInstagramError(
        payload,
        "Instagram rejected the stored authorisation. Reconnect the account.",
      ),
      retryable: classified.retryable,
    };
  }
  const id =
    typeof payload["user_id"] === "string" || typeof payload["user_id"] === "number"
      ? String(payload["user_id"])
      : typeof payload["id"] === "string"
        ? (payload["id"] as string)
        : null;
  if (!id) {
    return {
      ok: false,
      state: "ACCOUNT_NOT_FOUND",
      error: "Instagram did not return an account for this authorisation.",
      retryable: false,
    };
  }
  return {
    ok: true,
    value: {
      id,
      username: typeof payload["username"] === "string" ? (payload["username"] as string) : null,
      name: typeof payload["name"] === "string" ? (payload["name"] as string) : null,
      accountType:
        typeof payload["account_type"] === "string" ? (payload["account_type"] as string) : null,
    },
  };
}

/* -------------------------------------------------------------- publishing */

export type InstagramReelInput = {
  fetchImpl: typeof fetch;
  /** Instagram professional account id from the Instagram Login connection. */
  instagramAccountId: string;
  /** Instagram USER access token. Never a Facebook Page token. */
  accessToken: string;
  /** Publicly reachable HTTPS URL Meta's servers fetch the file from. */
  videoUrl: string;
  caption: string;
  now: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The complete official Reels flow on the Instagram Graph host:
 * create container → poll processing → media_publish → permalink.
 * Only the id returned by `media_publish` becomes the published media id.
 */
export async function publishInstagramLoginReel(input: InstagramReelInput): Promise<PublishResult> {
  const sleep = input.sleep ?? defaultSleep;
  const interval = input.pollIntervalMs ?? 5_000;
  const attempts = input.maxPollAttempts ?? 24;

  if (!/^https:\/\//i.test(input.videoUrl)) {
    return {
      ok: false,
      state: "VALIDATION_FAILED",
      error: "Instagram can only fetch media from a public HTTPS link.",
      retryable: false,
    };
  }

  /* 1. Container */
  let containerResponse: Response;
  try {
    containerResponse = await input.fetchImpl(
      instagramGraphUrl(`${input.instagramAccountId}/media`),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: input.videoUrl,
          caption: input.caption,
          access_token: input.accessToken,
        }).toString(),
      },
    );
  } catch (error) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: instagramTransportDetail("CREATE_REEL_CONTAINER", error),
      retryable: true,
    };
  }
  const containerPayload = await readJson(containerResponse);
  if (!containerResponse.ok) {
    const classified = instagramErrorState(containerResponse.status, containerPayload);
    return {
      ok: false,
      state: publicationStateFor(classified.state),
      error: `${classified.state}: ${sanitiseInstagramError(
        containerPayload,
        `Instagram refused the media container (HTTP ${containerResponse.status}).`,
      )}`,
      retryable: classified.retryable,
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

  /* 2. Processing — a container is never a publication */
  let ready = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let statusResponse: Response;
    try {
      statusResponse = await input.fetchImpl(
        instagramGraphUrl(containerId, {
          fields: "status_code,status",
          access_token: input.accessToken,
        }),
      );
    } catch (error) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: instagramTransportDetail("POLL_CONTAINER_STATUS", error),
        retryable: true,
      };
    }
    const statusPayload = await readJson(statusResponse);
    const statusCode =
      typeof statusPayload["status_code"] === "string"
        ? (statusPayload["status_code"] as string)
        : "IN_PROGRESS";
    if (statusCode === "FINISHED") {
      ready = true;
      break;
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      return {
        ok: false,
        state: statusCode === "EXPIRED" ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
        error: sanitiseInstagramError(
          statusPayload,
          statusCode === "EXPIRED"
            ? "Instagram could not fetch the video before the media link expired."
            : "Instagram could not process the video file.",
        ),
        retryable: statusCode === "EXPIRED",
      };
    }
    await sleep(interval);
  }
  if (!ready) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error:
        "MEDIA_PROCESSING_TIMEOUT: Instagram was still processing the video. Nothing was published.",
      retryable: true,
    };
  }

  /* 3. media_publish — the only step that produces a real media id */
  let publishResponse: Response;
  try {
    publishResponse = await input.fetchImpl(
      instagramGraphUrl(`${input.instagramAccountId}/media_publish`),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: input.accessToken,
        }).toString(),
      },
    );
  } catch (error) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: instagramTransportDetail("MEDIA_PUBLISH", error),
      retryable: true,
    };
  }
  const publishPayload = await readJson(publishResponse);
  if (!publishResponse.ok) {
    const classified = instagramErrorState(publishResponse.status, publishPayload);
    return {
      ok: false,
      state: publicationStateFor(classified.state),
      error: `${classified.state}: ${sanitiseInstagramError(
        publishPayload,
        `Instagram refused to publish the media (HTTP ${publishResponse.status}).`,
      )}`,
      retryable: classified.retryable,
    };
  }
  const mediaId =
    typeof publishPayload["id"] === "string" ? (publishPayload["id"] as string) : null;
  if (!mediaId || mediaId === containerId) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "PUBLISH_FAILED: Instagram did not return a published media identifier.",
      retryable: true,
    };
  }

  /* 4. Permalink — best effort; never blocks a confirmed publication */
  let permalink: string | null = null;
  try {
    const permaResponse = await input.fetchImpl(
      instagramGraphUrl(mediaId, { fields: "permalink", access_token: input.accessToken }),
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

  return { ok: true, platformPostId: mediaId, platformUrl: permalink, publishedAt: input.now };
}

/* ---------------------------------------------------------------- insights */

/** Media metrics Instagram exposes for Reels at this permission level. */
export const INSTAGRAM_REEL_METRICS = [
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saved",
  "total_interactions",
] as const;

export type InstagramInsights = {
  /** Only values Instagram actually returned. Nothing is inferred. */
  metrics: Record<string, number>;
  /** Metrics the API/permission level did not return, for honest display. */
  unavailable: string[];
};

/**
 * Real Instagram media insights. Anything Instagram does not return is listed
 * as unavailable so the console can say "NOT AVAILABLE FROM INSTAGRAM API"
 * rather than invent a number.
 */
export async function fetchInstagramMediaInsights(
  fetchImpl: typeof fetch,
  input: { mediaId: string; accessToken: string; metrics?: readonly string[] },
): Promise<InstagramResult<InstagramInsights>> {
  const wanted = input.metrics ?? INSTAGRAM_REEL_METRICS;
  let response: Response;
  try {
    response = await fetchImpl(
      instagramGraphUrl(`${input.mediaId}/insights`, {
        metric: wanted.join(","),
        access_token: input.accessToken,
      }),
    );
  } catch (error) {
    return transport(error, "PLATFORM_REJECTED");
  }
  const payload = await readJson(response);
  if (!response.ok) {
    const classified = instagramErrorState(response.status, payload);
    return {
      ok: false,
      state: classified.state,
      error: sanitiseInstagramError(payload, "Instagram did not return insights for this media."),
      retryable: classified.retryable,
    };
  }
  const rows = Array.isArray(payload["data"]) ? (payload["data"] as Record<string, unknown>[]) : [];
  const metrics: Record<string, number> = {};
  for (const row of rows) {
    const name = typeof row["name"] === "string" ? (row["name"] as string) : null;
    const values = Array.isArray(row["values"]) ? (row["values"] as Record<string, unknown>[]) : [];
    const value = values[0]?.["value"];
    if (name && typeof value === "number" && Number.isFinite(value)) metrics[name] = value;
  }
  return {
    ok: true,
    value: { metrics, unavailable: wanted.filter((name) => !(name in metrics)) },
  };
}

/* ---------------------------------------------------------- console status */

/**
 * The single source of truth for "Instagram is connected".
 *
 * Instagram counts as connected ONLY when the Instagram Login callback stored
 * an encrypted Instagram USER token AND discovered the professional account.
 * A Facebook Page that happens to have a linked Instagram account proves
 * nothing here and must never produce a connected state.
 */
export function instagramIsConnected(input: {
  hasStoredToken: boolean;
  accountId: string | null | undefined;
}): boolean {
  return input.hasStoredToken && Boolean(input.accountId);
}

export type InstagramStatusInput = {
  configured: boolean;
  connected: boolean;
  expired: boolean;
  paused: boolean;
  accountFound: boolean;
  lastError: string | null;
  publishedBefore: boolean;
};

export type InstagramStatusWord =
  | "CONFIGURATION REQUIRED"
  | "NOT CONNECTED"
  | "AUTHORIZATION REQUIRED"
  | "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND"
  | "PUBLISHING PAUSED"
  | "LAST ATTEMPT FAILED"
  | "CONNECTED";

export function instagramStatusWord(input: InstagramStatusInput): InstagramStatusWord {
  if (!input.configured) return "CONFIGURATION REQUIRED";
  if (!input.connected) return "NOT CONNECTED";
  if (input.expired) return "AUTHORIZATION REQUIRED";
  if (!input.accountFound) return "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND";
  if (input.paused) return "PUBLISHING PAUSED";
  if (input.lastError) return "LAST ATTEMPT FAILED";
  return "CONNECTED";
}

export function instagramStatusDetail(input: InstagramStatusInput): string {
  switch (instagramStatusWord(input)) {
    case "CONFIGURATION REQUIRED":
      return "The Instagram application credentials are not set up on the server yet.";
    case "NOT CONNECTED":
      return "Connect Instagram to publish Reels from your Instagram professional account.";
    case "AUTHORIZATION REQUIRED":
      return "The Instagram authorisation has expired. Reconnect the account.";
    case "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND":
      return "Instagram did not return a professional account for this sign-in.";
    case "PUBLISHING PAUSED":
      return "Connected. Publishing to Instagram is switched off.";
    case "LAST ATTEMPT FAILED":
      return input.lastError ?? "The last attempt failed.";
    default:
      return input.publishedBefore
        ? "Connected and confirmed by Instagram."
        : "Connected. No publication has been confirmed by Instagram yet.";
  }
}
