/**
 * Official Pinterest API v5, as a pure module.
 *
 * The transport is injected, so nothing here touches the network in tests.
 * Rules that hold throughout:
 *   1. Boards are only ever the ones Pinterest returned. No board is chosen
 *      silently and none is created.
 *   2. A Pin is only ever confirmed when Pinterest returned a Pin id.
 *   3. The cover always belongs to the exact video being pinned — either the
 *      thumbnail stored for that video, or a deterministic frame of it.
 */
import type { PublishResult } from "./types";

const BASE = "https://api.pinterest.com/v5";

/** Frame taken as the cover when a video has no stored thumbnail. */
export const PINTEREST_COVER_FRAME_MS = 1000;

function pinterestError(payload: Record<string, unknown>, status: number): string {
  const message = payload["message"];
  if (typeof message === "string" && message) return message;
  return `Pinterest refused the request (HTTP ${status}).`;
}

export type PinterestAccount = { username: string; type: string | null };

export async function fetchPinterestAccount(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<{ ok: true; value: PinterestAccount } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/user_account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The request to Pinterest could not be completed." };
  }
  if (status >= 400) return { ok: false, error: pinterestError(payload, status) };
  const username = payload["username"];
  if (typeof username !== "string" || !username) {
    return { ok: false, error: "Pinterest did not return the signed-in account." };
  }
  return {
    ok: true,
    value: {
      username,
      type: typeof payload["account_type"] === "string" ? (payload["account_type"] as string) : null,
    },
  };
}

export type PinterestBoard = { id: string; name: string; privacy: string | null };

/** The boards this account actually has. Never invents or creates one. */
export async function fetchPinterestBoards(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<{ ok: true; value: PinterestBoard[] } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/boards?page_size=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The request to Pinterest could not be completed." };
  }
  if (status >= 400) return { ok: false, error: pinterestError(payload, status) };
  const items = Array.isArray(payload["items"])
    ? (payload["items"] as Record<string, unknown>[])
    : [];
  return {
    ok: true,
    value: items
      .filter((item) => typeof item["id"] === "string")
      .map((item) => ({
        id: String(item["id"]),
        name: typeof item["name"] === "string" ? (item["name"] as string) : "Board",
        privacy: typeof item["privacy"] === "string" ? (item["privacy"] as string) : null,
      })),
  };
}

export type PinterestPublishRequest = {
  fetchImpl: typeof fetch;
  accessToken: string;
  /** The founder-selected board. Publishing refuses without one. */
  boardId: string | null;
  /** A temporary, private link to the EXACT selected production video. */
  videoUrl: string;
  /** A cover image belonging to the exact same video, when one is stored. */
  coverImageUrl?: string | null;
  title: string;
  description: string;
  /** The real EarnRoom destination. Never invented. */
  link: string;
  now: number;
  sleep?: (ms: number) => Promise<void>;
  statusChecks?: number;
};

export type PinterestPublishOutcome = PublishResult & { mediaId?: string | null };

/** Registers the media slot, uploads the exact file, waits, then creates the Pin. */
export async function publishPinterestVideoPin(
  request: PinterestPublishRequest,
): Promise<PinterestPublishOutcome> {
  const { fetchImpl, accessToken } = request;
  const sleep = request.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  if (!request.boardId) {
    return {
      ok: false,
      state: "VALIDATION_FAILED",
      error: "No Pinterest board has been chosen. Select the destination board first.",
      retryable: false,
    };
  }

  let bytes: Uint8Array;
  try {
    const file = await fetchImpl(request.videoUrl);
    if (!file.ok) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: "The video file could not be read for upload.",
        retryable: true,
      };
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The video file could not be downloaded for upload.",
      retryable: true,
    };
  }

  /* 1. Register the media slot. */
  let register: Response;
  try {
    register = await fetchImpl(`${BASE}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "video" }),
    });
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The upload could not be started with Pinterest.",
      retryable: true,
    };
  }
  const registered = (await register.json().catch(() => ({}))) as Record<string, unknown>;
  if (register.status === 401 || register.status === 403) {
    return {
      ok: false,
      state: "AUTH_REQUIRED",
      error: "Pinterest did not accept the stored sign-in. Reconnect Pinterest.",
      retryable: true,
    };
  }
  if (!register.ok) {
    return {
      ok: false,
      state: register.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: pinterestError(registered, register.status),
      retryable: register.status >= 500,
    };
  }
  const mediaId =
    typeof registered["media_id"] === "string" ? (registered["media_id"] as string) : null;
  const uploadUrl =
    typeof registered["upload_url"] === "string" ? (registered["upload_url"] as string) : null;
  const parameters = (registered["upload_parameters"] ?? {}) as Record<string, unknown>;
  if (!mediaId || !uploadUrl) {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "Pinterest did not return an upload destination.",
      retryable: true,
    };
  }

  /* 2. Send the exact bytes to the storage endpoint Pinterest gave us. */
  const form = new FormData();
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value === "string") form.append(name, value);
  }
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: "video/mp4" }), "video.mp4");
  try {
    const upload = await fetchImpl(uploadUrl, { method: "POST", body: form });
    if (!upload.ok) {
      return {
        ok: false,
        state: "UPLOAD_FAILED",
        error: `Pinterest storage rejected the upload (HTTP ${upload.status}).`,
        retryable: true,
      };
    }
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The video file could not be sent to Pinterest.",
      retryable: true,
    };
  }

  /* 3. Wait for Pinterest to finish processing the exact file. */
  const checks = request.statusChecks ?? 10;
  let last = "registered";
  for (let attempt = 0; attempt < checks; attempt += 1) {
    const status = await fetchPinterestMediaStatus(fetchImpl, accessToken, mediaId);
    if (!status.ok) {
      return { ok: false, state: "UPLOAD_FAILED", error: status.error, retryable: true };
    }
    last = status.value;
    if (last === "succeeded") break;
    if (last === "failed") {
      return {
        ok: false,
        state: "PLATFORM_REJECTED",
        error: "Pinterest could not process this video.",
        retryable: false,
      };
    }
    await sleep(3000);
  }
  if (last !== "succeeded") {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: `Pinterest is still processing this video (${last}). No Pin was created.`,
      retryable: true,
      mediaId,
    };
  }

  /* 4. Create the Pin. Only its id counts as a publication. */
  const mediaSource: Record<string, unknown> = {
    source_type: "video_id",
    media_id: mediaId,
    // The cover always comes from this exact video: its own stored thumbnail
    // when there is one, otherwise a fixed frame of the same file.
    ...(request.coverImageUrl
      ? { cover_image_url: request.coverImageUrl }
      : { cover_image_key_frame_time: PINTEREST_COVER_FRAME_MS }),
  };
  let pin: Response;
  try {
    pin = await fetchImpl(`${BASE}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: request.boardId,
        title: request.title.slice(0, 100),
        description: request.description.slice(0, 800),
        link: request.link,
        media_source: mediaSource,
      }),
    });
  } catch {
    return {
      ok: false,
      state: "UPLOAD_FAILED",
      error: "The Pin could not be created on Pinterest.",
      retryable: true,
      mediaId,
    };
  }
  const payload = (await pin.json().catch(() => ({}))) as Record<string, unknown>;
  const pinId = typeof payload["id"] === "string" ? (payload["id"] as string) : null;
  if (!pin.ok || !pinId) {
    return {
      ok: false,
      state: pin.status >= 500 ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
      error: pinterestError(payload, pin.status),
      retryable: pin.status >= 500,
      mediaId,
    };
  }
  return {
    ok: true,
    platformPostId: pinId,
    platformUrl: `https://www.pinterest.com/pin/${pinId}/`,
    publishedAt: request.now,
    mediaId,
  };
}

export async function fetchPinterestMediaStatus(
  fetchImpl: typeof fetch,
  accessToken: string,
  mediaId: string,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(`${BASE}/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The status request to Pinterest could not be completed." };
  }
  if (status >= 400) return { ok: false, error: pinterestError(payload, status) };
  return {
    ok: true,
    value: typeof payload["status"] === "string" ? (payload["status"] as string) : "registered",
  };
}
