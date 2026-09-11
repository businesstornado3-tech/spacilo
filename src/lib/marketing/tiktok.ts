/**
 * Official TikTok Content Posting API, as a pure module.
 *
 * The transport is injected, so nothing here touches the network in tests and
 * no vendor SDK is pulled in. Rules that hold throughout:
 *   1. Creator settings are always read from TikTok before posting. Privacy
 *      options are never hard-coded — only what TikTok returned may be used.
 *   2. Only TikTok's own PUBLISH_COMPLETE status counts as published. An
 *      accepted upload is not a publication.
 *   3. An unaudited app can only put a post in the creator's inbox as private;
 *      that is reported as exactly what it is, never as publicly live.
 */
import type { PublishResult } from "./types";

const BASE = "https://open.tiktokapis.com/v2";

export type TiktokCreatorInfo = {
  username: string | null;
  nickname: string | null;
  /** Only the privacy levels TikTok itself says this creator may use. */
  privacyOptions: string[];
  maxVideoSeconds: number | null;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
};

function tiktokError(payload: Record<string, unknown>, status: number): string {
  const error = (payload["error"] ?? {}) as Record<string, unknown>;
  const message = error["message"];
  const code = error["code"];
  if (typeof message === "string" && message && message !== "ok") return message;
  if (typeof code === "string" && code && code !== "ok") return `TikTok reported "${code}".`;
  return `TikTok refused the request (HTTP ${status}).`;
}

function isRefusal(payload: Record<string, unknown>): boolean {
  const error = (payload["error"] ?? {}) as Record<string, unknown>;
  const code = error["code"];
  return typeof code === "string" && code !== "ok";
}

/** What TikTok says this creator may actually do right now. */
export async function fetchTiktokCreatorInfo(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<{ ok: true; value: TiktokCreatorInfo } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The request to TikTok could not be completed." };
  }
  if (status >= 400 || isRefusal(payload)) {
    return { ok: false, error: tiktokError(payload, status) };
  }
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const options = Array.isArray(data["privacy_level_options"])
    ? (data["privacy_level_options"] as unknown[]).filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  return {
    ok: true,
    value: {
      username: typeof data["creator_username"] === "string" ? data["creator_username"] : null,
      nickname: typeof data["creator_nickname"] === "string" ? data["creator_nickname"] : null,
      privacyOptions: options,
      maxVideoSeconds:
        typeof data["max_video_post_duration_sec"] === "number"
          ? data["max_video_post_duration_sec"]
          : null,
      commentDisabled: data["comment_disabled"] === true,
      duetDisabled: data["duet_disabled"] === true,
      stitchDisabled: data["stitch_disabled"] === true,
    },
  };
}

/**
 * Chooses the privacy level to send. Only ever one TikTok itself offered; the
 * most private option is preferred unless the founder asked for another one
 * that TikTok also offered.
 */
export function resolveTiktokPrivacy(
  options: readonly string[],
  requested?: string | null,
): { ok: true; value: string } | { ok: false; error: string } {
  if (options.length === 0) {
    return {
      ok: false,
      error:
        "TikTok returned no posting privacy option for this account, so nothing may be posted yet.",
    };
  }
  if (requested && options.includes(requested)) return { ok: true, value: requested };
  if (requested) {
    return {
      ok: false,
      error: `TikTok does not offer "${requested}" for this account. Available: ${options.join(", ")}.`,
    };
  }
  const preferred = ["SELF_ONLY", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "PUBLIC_TO_EVERYONE"];
  const chosen = preferred.find((entry) => options.includes(entry)) ?? options[0]!;
  return { ok: true, value: chosen };
}

/** True when the chosen privacy means the post is not publicly visible. */
export function tiktokVisibilityNote(privacy: string): string {
  return privacy === "PUBLIC_TO_EVERYONE"
    ? "TikTok accepted this as a public post."
    : `TikTok accepted this as ${privacy.replaceAll("_", " ").toLowerCase()} — it is not publicly visible.`;
}

export type TiktokPublishRequest = {
  fetchImpl: typeof fetch;
  accessToken: string;
  /** A temporary, verified link TikTok pulls the exact file from. */
  videoUrl: string;
  title: string;
  seconds: number;
  /** Founder's choice, only used when TikTok offers it. */
  requestedPrivacy?: string | null;
  now: number;
  sleep?: (ms: number) => Promise<void>;
  /** How many times to ask TikTok whether the post finished. */
  statusChecks?: number;
};

export type TiktokPublishOutcome = PublishResult & {
  publishId?: string | null;
  privacy?: string | null;
  note?: string | null;
};

/** Direct Post: creator info, init, then TikTok's own publish status. */
export async function publishTiktokVideo(
  request: TiktokPublishRequest,
): Promise<TiktokPublishOutcome> {
  const { fetchImpl, accessToken } = request;
  const sleep = request.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const creator = await fetchTiktokCreatorInfo(fetchImpl, accessToken);
  if (!creator.ok) {
    return { ok: false, state: "AUTH_REQUIRED", error: creator.error, retryable: true };
  }
  if (creator.value.maxVideoSeconds && request.seconds > creator.value.maxVideoSeconds) {
    return {
      ok: false,
      state: "VALIDATION_FAILED",
      error: `TikTok allows ${creator.value.maxVideoSeconds}s for this account; this video is ${request.seconds}s.`,
      retryable: false,
    };
  }
  const privacy = resolveTiktokPrivacy(creator.value.privacyOptions, request.requestedPrivacy);
  if (!privacy.ok) {
    return { ok: false, state: "PLATFORM_REJECTED", error: privacy.error, retryable: false };
  }

  let init: Response;
  try {
    init = await fetchImpl(`${BASE}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: request.title.slice(0, 150),
          privacy_level: privacy.value,
          disable_comment: creator.value.commentDisabled,
          disable_duet: creator.value.duetDisabled,
          disable_stitch: creator.value.stitchDisabled,
        },
        source_info: { source: "PULL_FROM_URL", video_url: request.videoUrl },
      }),
    });
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The post could not be started with TikTok.",
      retryable: true,
    };
  }
  const payload = (await init.json().catch(() => ({}))) as Record<string, unknown>;
  if (init.status === 401 || init.status === 403) {
    return {
      ok: false,
      state: "AUTH_REQUIRED",
      error: "TikTok did not accept the stored sign-in. Reconnect TikTok.",
      retryable: true,
    };
  }
  if (!init.ok || isRefusal(payload)) {
    return {
      ok: false,
      state: init.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: tiktokError(payload, init.status),
      retryable: init.status >= 500,
    };
  }
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const publishId = typeof data["publish_id"] === "string" ? (data["publish_id"] as string) : null;
  if (!publishId) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "TikTok accepted the request but returned no post reference.",
      retryable: true,
    };
  }

  /* Only TikTok's own status makes this a publication. */
  const checks = request.statusChecks ?? 10;
  let lastStatus = "PROCESSING";
  for (let attempt = 0; attempt < checks; attempt += 1) {
    const status = await fetchTiktokPublishStatus(fetchImpl, accessToken, publishId);
    if (!status.ok) {
      return { ok: false, state: "UPLOAD_FAILED", error: status.error, retryable: true };
    }
    lastStatus = status.value.status;
    if (lastStatus === "PUBLISH_COMPLETE") {
      return {
        ok: true,
        platformPostId: status.value.postId ?? publishId,
        platformUrl: status.value.postUrl,
        publishedAt: request.now,
        publishId,
        privacy: privacy.value,
        note: tiktokVisibilityNote(privacy.value),
      };
    }
    if (lastStatus === "FAILED") {
      return {
        ok: false,
        state: "PLATFORM_REJECTED",
        error: status.value.failReason ?? "TikTok reported the post failed.",
        retryable: false,
      };
    }
    await sleep(3000);
  }
  return {
    ok: false,
    state: "UPLOAD_FAILED",
    error: `TikTok is still processing this post (${lastStatus}). It has not confirmed a publication.`,
    retryable: true,
    publishId,
  };
}

export type TiktokPublishStatus = {
  status: string;
  postId: string | null;
  postUrl: string | null;
  failReason: string | null;
};

export async function fetchTiktokPublishStatus(
  fetchImpl: typeof fetch,
  accessToken: string,
  publishId: string,
): Promise<{ ok: true; value: TiktokPublishStatus } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The status request to TikTok could not be completed." };
  }
  if (status >= 400 || isRefusal(payload)) {
    return { ok: false, error: tiktokError(payload, status) };
  }
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(data["publicaly_available_post_id"])
    ? (data["publicaly_available_post_id"] as unknown[]).filter(
        (entry): entry is string | number => typeof entry === "string" || typeof entry === "number",
      )
    : [];
  const postId = ids.length ? String(ids[0]) : null;
  return {
    ok: true,
    value: {
      status: typeof data["status"] === "string" ? (data["status"] as string) : "PROCESSING",
      postId,
      postUrl: postId ? `https://www.tiktok.com/video/${postId}` : null,
      failReason:
        typeof data["fail_reason"] === "string" ? (data["fail_reason"] as string) : null,
    },
  };
}

/** The signed-in TikTok account, for the connection label. */
export async function fetchTiktokUser(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<
  { ok: true; value: { openId: string; username: string | null } } | { ok: false; error: string }
> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/user/info/?fields=open_id,username,display_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The request to TikTok could not be completed." };
  }
  if (status >= 400 || isRefusal(payload)) {
    return { ok: false, error: tiktokError(payload, status) };
  }
  const user = ((payload["data"] ?? {}) as Record<string, unknown>)["user"] as
    | Record<string, unknown>
    | undefined;
  const openId = typeof user?.["open_id"] === "string" ? (user["open_id"] as string) : null;
  if (!openId) return { ok: false, error: "TikTok did not return the signed-in account." };
  const username =
    typeof user?.["username"] === "string"
      ? (user["username"] as string)
      : typeof user?.["display_name"] === "string"
        ? (user["display_name"] as string)
        : null;
  return { ok: true, value: { openId, username } };
}
