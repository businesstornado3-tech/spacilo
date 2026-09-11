/**
 * Official LinkedIn API calls, as a pure module.
 *
 * The transport is injected, so nothing here needs the network to be tested and
 * no vendor SDK is pulled in. Three rules hold throughout:
 *   1. An identity (member or organisation) is only ever reported when LinkedIn
 *      itself returned it. Nothing is invented or assumed.
 *   2. A publication is only ever confirmed when LinkedIn returned a post URN
 *      after the actual file bytes were uploaded and the upload finalised.
 *   3. No client secret or token is ever logged or returned to the browser.
 */
import type { PublishResult } from "./types";

/** Versioned REST surface. LinkedIn requires an explicit version header. */
export const LINKEDIN_VERSION = "202411";
export const LINKEDIN_REST = "https://api.linkedin.com/rest";

/**
 * The least LinkedIn will accept for posting a video as the signed-in member:
 * OpenID identity (to know who the author is) plus member posting.
 */
export const LINKEDIN_MEMBER_SCOPES = ["openid", "profile", "w_member_social"] as const;

/**
 * Organisation posting. Only requested when the application has been granted
 * the Community Management API; a member connection works without these.
 */
export const LINKEDIN_ORGANIZATION_SCOPES = [
  "w_organization_social",
  "r_organization_admin",
] as const;

function headers(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function reason(payload: Record<string, unknown>, status: number): string {
  const message = payload["message"];
  if (typeof message === "string" && message) return message;
  return `LinkedIn refused the request (HTTP ${status}).`;
}

export type LinkedinMember = { urn: string; name: string };

/** The signed-in member, from LinkedIn's OpenID userinfo endpoint. */
export async function fetchLinkedinMember(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<{ ok: true; value: LinkedinMember } | { ok: false; error: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "The request to LinkedIn could not be completed." };
  }
  if (status >= 400) return { ok: false, error: reason(payload, status) };
  const sub = payload["sub"];
  if (typeof sub !== "string" || !sub) {
    return { ok: false, error: "LinkedIn did not return the signed-in member." };
  }
  const name =
    typeof payload["name"] === "string" ? (payload["name"] as string) : "LinkedIn member";
  return { ok: true, value: { urn: `urn:li:person:${sub}`, name } };
}

export type LinkedinOrganization = { urn: string; name: string };

/**
 * Organisations (Company Pages) the signed-in member actually administers.
 *
 * If LinkedIn refuses — which it does whenever the app has not been granted
 * the Community Management API — this returns an empty list with LinkedIn's own
 * reason. It never guesses an organisation.
 */
export async function fetchLinkedinOrganizations(
  fetchImpl: typeof fetch,
  accessToken: string,
): Promise<{ organizations: LinkedinOrganization[]; detail: string }> {
  let status = 0;
  let payload: Record<string, unknown> = {};
  try {
    const response = await fetchImpl(
      `${LINKEDIN_REST}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
      { headers: headers(accessToken) },
    );
    status = response.status;
    payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { organizations: [], detail: "The request to LinkedIn could not be completed." };
  }
  if (status >= 400) {
    return {
      organizations: [],
      detail:
        status === 403
          ? "LinkedIn has not granted this application Company Page posting, so only member posting is available."
          : reason(payload, status),
    };
  }
  const elements = Array.isArray(payload["elements"])
    ? (payload["elements"] as Record<string, unknown>[])
    : [];
  const organizations = elements
    .map((entry) => entry["organization"])
    .filter((value): value is string => typeof value === "string" && value.startsWith("urn:li:"))
    .map((urn) => ({ urn, name: urn }));
  return {
    organizations,
    detail: organizations.length
      ? "Organisations read from LinkedIn."
      : "LinkedIn returned no organisation this member administers.",
  };
}

export type LinkedinPublishRequest = {
  fetchImpl: typeof fetch;
  accessToken: string;
  /** urn:li:person:… or urn:li:organization:… — never guessed. */
  authorUrn: string;
  /** A temporary, private link the server can read the exact file from. */
  videoUrl: string;
  title: string;
  commentary: string;
  now: number;
};

export type LinkedinPublishOutcome = PublishResult & { mediaId?: string | null };

function failure(
  error: string,
  retryable: boolean,
  state: "UPLOAD_FAILED" | "AUTH_REQUIRED" | "PLATFORM_REJECTED",
): LinkedinPublishOutcome {
  return { ok: false, state, error, retryable };
}

/**
 * The real LinkedIn video flow: initialize upload, PUT every part, finalize,
 * then create the post. Nothing before the post URN counts as published.
 */
export async function publishLinkedinVideo(
  request: LinkedinPublishRequest,
): Promise<LinkedinPublishOutcome> {
  const { fetchImpl, accessToken, authorUrn } = request;

  let bytes: Uint8Array;
  try {
    const file = await fetchImpl(request.videoUrl);
    if (!file.ok)
      return failure("The video file could not be read for upload.", true, "UPLOAD_FAILED");
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return failure("The video file could not be downloaded for upload.", true, "UPLOAD_FAILED");
  }
  if (bytes.byteLength === 0) {
    return failure("The video file is empty.", false, "UPLOAD_FAILED");
  }

  /* 1. Initialize the upload. */
  let init: Response;
  try {
    init = await fetchImpl(`${LINKEDIN_REST}/videos?action=initializeUpload`, {
      method: "POST",
      headers: { ...headers(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes: bytes.byteLength,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });
  } catch {
    return failure("The upload could not be started with LinkedIn.", true, "UPLOAD_FAILED");
  }
  const initPayload = (await init.json().catch(() => ({}))) as Record<string, unknown>;
  if (init.status === 401 || init.status === 403) {
    return failure(
      "LinkedIn did not accept the stored sign-in for posting. Reconnect LinkedIn and accept the posting permission.",
      true,
      "AUTH_REQUIRED",
    );
  }
  if (!init.ok) {
    return failure(reason(initPayload, init.status), init.status >= 500, "PLATFORM_REJECTED");
  }
  const value = (initPayload["value"] ?? {}) as Record<string, unknown>;
  const videoUrn = typeof value["video"] === "string" ? (value["video"] as string) : null;
  const uploadToken =
    typeof value["uploadToken"] === "string" ? (value["uploadToken"] as string) : "";
  const instructions = Array.isArray(value["uploadInstructions"])
    ? (value["uploadInstructions"] as Record<string, unknown>[])
    : [];
  if (!videoUrn || instructions.length === 0) {
    return failure("LinkedIn did not return an upload destination.", true, "UPLOAD_FAILED");
  }

  /* 2. Send the bytes, part by part, exactly as LinkedIn instructed. */
  const partIds: string[] = [];
  for (const instruction of instructions) {
    const uploadUrl = instruction["uploadUrl"];
    if (typeof uploadUrl !== "string") {
      return failure("LinkedIn returned an unusable upload instruction.", true, "UPLOAD_FAILED");
    }
    const first = Number(instruction["firstByte"] ?? 0);
    const last = Number(instruction["lastByte"] ?? bytes.byteLength - 1);
    const slice = bytes.slice(first, last + 1);
    let put: Response;
    try {
      put = await fetchImpl(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: slice as unknown as BodyInit,
      });
    } catch {
      return failure("The video file could not be sent to LinkedIn.", true, "UPLOAD_FAILED");
    }
    if (!put.ok) {
      return failure(
        `LinkedIn rejected part of the upload (HTTP ${put.status}).`,
        put.status >= 500,
        "UPLOAD_FAILED",
      );
    }
    const etag = put.headers.get("etag");
    if (etag) partIds.push(etag.replaceAll('"', ""));
  }

  /* 3. Finalize. */
  let finalize: Response;
  try {
    finalize = await fetchImpl(`${LINKEDIN_REST}/videos?action=finalizeUpload`, {
      method: "POST",
      headers: { ...headers(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds: partIds },
      }),
    });
  } catch {
    return failure("The upload could not be completed with LinkedIn.", true, "UPLOAD_FAILED");
  }
  if (!finalize.ok) {
    const payload = (await finalize.json().catch(() => ({}))) as Record<string, unknown>;
    return failure(reason(payload, finalize.status), finalize.status >= 500, "UPLOAD_FAILED");
  }

  /* 4. Create the post. Only its URN counts as a publication. */
  let post: Response;
  try {
    post = await fetchImpl(`${LINKEDIN_REST}/posts`, {
      method: "POST",
      headers: { ...headers(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        author: authorUrn,
        commentary: request.commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: { media: { id: videoUrn, title: request.title.slice(0, 200) } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
  } catch {
    return failure("The post could not be created on LinkedIn.", true, "UPLOAD_FAILED");
  }
  if (post.status === 401 || post.status === 403) {
    return failure(
      "LinkedIn did not allow this account to post. Reconnect and accept the posting permission.",
      true,
      "AUTH_REQUIRED",
    );
  }
  const postPayload = (await post.json().catch(() => ({}))) as Record<string, unknown>;
  const postUrn =
    post.headers.get("x-restli-id") ??
    (typeof postPayload["id"] === "string" ? (postPayload["id"] as string) : null);
  if (!post.ok || !postUrn) {
    return failure(
      reason(postPayload, post.status),
      post.status >= 500,
      post.ok ? "UPLOAD_FAILED" : "PLATFORM_REJECTED",
    );
  }

  return {
    ok: true,
    platformPostId: postUrn,
    platformUrl: `https://www.linkedin.com/feed/update/${postUrn}/`,
    publishedAt: request.now,
    mediaId: videoUrn,
  };
}
