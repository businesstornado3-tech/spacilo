/**
 * Official YouTube Data API v3 calls, as a pure module.
 *
 * The transport is injected, so nothing here needs the network to be tested
 * and no vendor SDK is pulled in. Two rules hold throughout:
 *   1. A channel is only ever reported when YouTube itself returned it.
 *   2. A publication is only ever confirmed when YouTube returned a video id
 *      after the actual file bytes were sent. Opening a resumable session is
 *      not a publication.
 */
import type { PublishResult } from "./types";

export type YoutubeChannel = {
  id: string;
  title: string;
  /** The @handle / custom URL, when the channel has one. */
  handle: string | null;
};

export type YoutubeChannelsResult = {
  ok: boolean;
  detail: string;
  channels: YoutubeChannel[];
};

function googleReason(payload: Record<string, unknown>): string | null {
  const error = (payload["error"] ?? {}) as Record<string, unknown>;
  const errors = Array.isArray(error["errors"]) ? (error["errors"] as Record<string, unknown>[]) : [];
  const first = errors[0] ?? {};
  return typeof first["reason"] === "string" ? (first["reason"] as string) : null;
}

function googleMessage(payload: Record<string, unknown>): string | null {
  const error = (payload["error"] ?? {}) as Record<string, unknown>;
  return typeof error["message"] === "string" ? (error["message"] as string) : null;
}

/** Explains a 401/403 in the founder's language, keeping Google's own reason. */
export function youtubeAuthFailureDetail(
  status: number,
  payload: Record<string, unknown>,
): string {
  const reason = googleReason(payload);
  const message = googleMessage(payload) ?? "";
  if (reason === "accessNotConfigured" || message.includes("has not been used in project")) {
    return "The YouTube Data API is not switched on for this Google Cloud project yet. Enable YouTube Data API v3, wait a few minutes, then retry — no need to reconnect.";
  }
  if (reason === "insufficientPermissions" || reason === "forbidden") {
    return "Google accepted the sign-in but the granted permissions do not cover this action. Reconnect and accept both permissions.";
  }
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
    return "YouTube's daily quota for this project has been used up. Try again after the quota resets.";
  }
  if (status === 401) {
    return "YouTube rejected the stored authorisation (it was revoked or has expired). Reconnect the channel.";
  }
  return `YouTube refused the request (${reason ?? "no reason given"}).`;
}

/** Lists the channels the stored authorisation actually owns. */
export async function fetchYoutubeChannels(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<YoutubeChannelsResult> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, detail: "The request to YouTube could not be completed.", channels: [] };
  }

  if (status === 401 || status === 403) {
    return { ok: false, detail: youtubeAuthFailureDetail(status, payload), channels: [] };
  }
  if (status >= 400) {
    return {
      ok: false,
      detail: googleMessage(payload) ?? `YouTube refused the request (HTTP ${status}).`,
      channels: [],
    };
  }

  const items = Array.isArray(payload["items"]) ? (payload["items"] as Record<string, unknown>[]) : [];
  const channels: YoutubeChannel[] = items
    .filter((item) => typeof item["id"] === "string")
    .map((item) => {
      const snippet = (item["snippet"] ?? {}) as Record<string, unknown>;
      return {
        id: String(item["id"]),
        title: typeof snippet["title"] === "string" ? snippet["title"] : "Untitled channel",
        handle: typeof snippet["customUrl"] === "string" ? snippet["customUrl"] : null,
      };
    });

  if (channels.length === 0) {
    return {
      ok: false,
      detail: "YouTube returned no channel for this account. The Google account has no YouTube channel.",
      channels: [],
    };
  }
  return { ok: true, detail: "Channels read from YouTube with the stored authorisation.", channels };
}

export type YoutubeUploadRequest = {
  fetchImpl: typeof fetch;
  accessToken: string;
  /** A temporary, private link the server can read the rendered file from. */
  videoUrl: string;
  title: string;
  description: string;
  tags: readonly string[];
  /** EarnRoom uploads unlisted or private until the founder promotes it. */
  privacyStatus: "private" | "unlisted" | "public";
  now: number;
};

/**
 * Real resumable upload: opens the session, sends the actual bytes, and only
 * reports success when YouTube returns a video id.
 */
export async function publishYoutubeVideo(request: YoutubeUploadRequest): Promise<PublishResult> {
  const { fetchImpl, accessToken } = request;

  let bytes: Uint8Array;
  try {
    const file = await fetchImpl(request.videoUrl);
    if (!file.ok) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: "The rendered video file could not be read for upload.",
        retryable: true,
      };
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The rendered video file could not be downloaded for upload.",
      retryable: true,
    };
  }
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The rendered video file is empty.",
      retryable: false,
    };
  }

  let start: Response;
  try {
    start = await fetchImpl(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(bytes.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: request.title.slice(0, 100),
            description: request.description.slice(0, 4000),
            tags: [...request.tags],
          },
          status: {
            privacyStatus: request.privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The upload could not be started with YouTube.",
      retryable: true,
    };
  }

  const location = start.headers.get("location");
  if (start.status === 401 || start.status === 403) {
    const payload = (await start.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: false,
      state: "AUTH_REQUIRED",
      error: youtubeAuthFailureDetail(start.status, payload),
      retryable: true,
    };
  }
  if (!start.ok || !location) {
    const payload = (await start.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: false,
      state: start.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: googleMessage(payload) ?? `YouTube refused the upload (HTTP ${start.status}).`,
      retryable: start.status >= 500 || start.status === 429,
    };
  }

  let put: Response;
  try {
    put = await fetchImpl(location, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength) },
      body: bytes as unknown as BodyInit,
    });
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The video file could not be sent to YouTube.",
      retryable: true,
    };
  }

  const payload = (await put.json().catch(() => ({}))) as Record<string, unknown>;
  const videoId = typeof payload["id"] === "string" ? (payload["id"] as string) : null;
  if (!put.ok || !videoId) {
    return {
      ok: false,
      state: put.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: googleMessage(payload) ?? `YouTube did not confirm the upload (HTTP ${put.status}).`,
      retryable: put.status >= 500 || put.status === 429,
    };
  }

  return {
    ok: true,
    platformPostId: videoId,
    platformUrl: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: request.now,
  };
}
