import { describe, expect, it } from "vitest";

import {
  META_GRAPH_VERSION,
  discoverInstagramAccount,
  discoverPages,
  metaStatusDetail,
  metaStatusWord,
  publishFacebookPageVideo,
  publishInstagramReel,
  sanitiseMetaError,
  type MetaStatusInput,
} from "./meta";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recorder(handlers: ((url: string, init?: RequestInit) => Response)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const handler = handlers[Math.min(index, handlers.length - 1)];
    index += 1;
    return handler!(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("meta graph version", () => {
  it("stays on the version the existing OAuth definitions use", () => {
    expect(META_GRAPH_VERSION).toBe("v21.0");
  });
});

describe("sanitiseMetaError", () => {
  it("redacts token-shaped material and falls back safely", () => {
    const message = sanitiseMetaError(
      {
        error: {
          message: "Invalid token EAABsBcs12345678abcdefgh for access_token=EAAsecretvalue",
        },
      },
      "fallback",
    );
    expect(message).not.toContain("EAABsBcs12345678abcdefgh");
    expect(message).toContain("[redacted]");
    expect(sanitiseMetaError({}, "fallback")).toBe("fallback");
  });
});

describe("discoverPages", () => {
  it("returns pages with their page tokens", async () => {
    const { fetchImpl, calls } = recorder([
      () =>
        json({
          data: [
            {
              id: "111",
              name: "EarnRoom",
              category: "Business",
              access_token: "page-token",
              tasks: ["CREATE_CONTENT", "MANAGE"],
            },
            { id: "222", name: "No token page" },
          ],
        }),
    ]);
    const result = await discoverPages(fetchImpl, "user-token");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({ id: "111", name: "EarnRoom", canPublish: true });
    expect(calls[0]!.url).toContain("/me/accounts");
  });

  it("reports an expired authorisation instead of throwing", async () => {
    const { fetchImpl } = recorder([() => json({ error: { message: "Session expired" } }, 401)]);
    const result = await discoverPages(fetchImpl, "user-token");
    expect(result).toMatchObject({ ok: false, retryable: true });
  });
});

describe("discoverInstagramAccount", () => {
  it("returns the linked professional account", async () => {
    const { fetchImpl } = recorder([
      () => json({ instagram_business_account: { id: "ig-1", username: "earnroom" } }),
    ]);
    const result = await discoverInstagramAccount(fetchImpl, "111", "page-token");
    expect(result).toEqual({ ok: true, value: { id: "ig-1", username: "earnroom", name: null } });
  });

  it("treats an unlinked page as a legitimate empty answer", async () => {
    const { fetchImpl } = recorder([() => json({ id: "111" })]);
    const result = await discoverInstagramAccount(fetchImpl, "111", "page-token");
    expect(result).toEqual({ ok: true, value: null });
  });
});

describe("publishFacebookPageVideo", () => {
  const base = {
    pageId: "111",
    pageAccessToken: "page-token",
    videoUrl: "https://signed.example/video.mp4",
    description: "Make space earn.",
    now: 1_700_000_000_000,
  };

  it("publishes with the page token and returns the real video id", async () => {
    const { fetchImpl, calls } = recorder([() => json({ id: "vid-9" })]);
    const result = await publishFacebookPageVideo({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: true, platformPostId: "vid-9" });
    expect(calls[0]!.url).toContain("/111/videos");
    expect(String(calls[0]!.init?.body)).toContain("access_token=page-token");
  });

  it("never publishes when Meta returns no id", async () => {
    const { fetchImpl } = recorder([() => json({})]);
    const result = await publishFacebookPageVideo({ ...base, fetchImpl });
    expect(result.ok).toBe(false);
  });

  it("maps a rejection to PLATFORM_REJECTED with a sanitised message", async () => {
    const { fetchImpl } = recorder([
      () => json({ error: { message: "Unsupported post request" } }, 400),
    ]);
    const result = await publishFacebookPageVideo({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, state: "PLATFORM_REJECTED" });
  });

  it("maps an auth failure to AUTH_REQUIRED", async () => {
    const { fetchImpl } = recorder([() => json({ error: { message: "expired" } }, 401)]);
    const result = await publishFacebookPageVideo({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, state: "AUTH_REQUIRED" });
  });
});

describe("publishInstagramReel", () => {
  const base = {
    instagramAccountId: "ig-1",
    pageAccessToken: "page-token",
    videoUrl: "https://signed.example/video.mp4",
    caption: "Make space earn.",
    now: 1_700_000_000_000,
    pollIntervalMs: 0,
    sleep: async () => {},
  };

  it("creates the container, waits, publishes and reads the permalink", async () => {
    const { fetchImpl, calls } = recorder([
      () => json({ id: "container-1" }),
      () => json({ status_code: "IN_PROGRESS" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ id: "media-77" }),
      () => json({ permalink: "https://www.instagram.com/reel/abc/" }),
    ]);
    const result = await publishInstagramReel({ ...base, fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      platformPostId: "media-77",
      platformUrl: "https://www.instagram.com/reel/abc/",
    });
    expect(calls[3]!.url).toContain("/ig-1/media_publish");
    expect(String(calls[3]!.init?.body)).toContain("creation_id=container-1");
  });

  it("never treats the container id as a published media id", async () => {
    const { fetchImpl } = recorder([
      () => json({ id: "container-1" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ id: "container-1" }),
    ]);
    const result = await publishInstagramReel({ ...base, fetchImpl });
    expect(result.ok).toBe(false);
  });

  it("fails honestly when processing errors", async () => {
    const { fetchImpl } = recorder([
      () => json({ id: "container-1" }),
      () => json({ status_code: "ERROR", error: { message: "Media could not be processed" } }),
    ]);
    const result = await publishInstagramReel({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, state: "PLATFORM_REJECTED" });
  });

  it("does not publish when processing never finishes", async () => {
    const { fetchImpl } = recorder([
      () => json({ id: "container-1" }),
      () => json({ status_code: "IN_PROGRESS" }),
    ]);
    const result = await publishInstagramReel({ ...base, fetchImpl, maxPollAttempts: 2 });
    expect(result).toMatchObject({ ok: false, state: "UPLOAD_FAILED", retryable: true });
  });

  it("reports a media publish rejection", async () => {
    const { fetchImpl } = recorder([
      () => json({ id: "container-1" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ error: { message: "Permission missing" } }, 403),
    ]);
    const result = await publishInstagramReel({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, state: "PLATFORM_REJECTED" });
  });
});

describe("metaStatusWord", () => {
  const base: MetaStatusInput = {
    platform: "facebook",
    configured: true,
    connected: true,
    expired: false,
    paused: false,
    pageSelected: true,
    instagramFound: true,
    lastError: null,
    publishedBefore: false,
  };

  it("reports each console state exactly", () => {
    expect(metaStatusWord({ ...base, configured: false })).toBe("CONFIGURATION REQUIRED");
    expect(metaStatusWord({ ...base, connected: false })).toBe("NOT CONNECTED");
    expect(metaStatusWord({ ...base, expired: true })).toBe("AUTHORIZATION REQUIRED");
    expect(metaStatusWord({ ...base, pageSelected: false })).toBe(
      "CONNECTED — PAGE SELECTION REQUIRED",
    );
    expect(metaStatusWord({ ...base, platform: "instagram", instagramFound: false })).toBe(
      "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND",
    );
    expect(metaStatusWord({ ...base, paused: true })).toBe("PUBLISHING PAUSED");
    expect(metaStatusWord({ ...base, lastError: "Meta refused" })).toBe("LAST ATTEMPT FAILED");
    expect(metaStatusWord(base)).toBe("CONNECTED");
  });

  it("never claims a confirmed publication before one happened", () => {
    expect(metaStatusDetail(base)).toContain("No publication has been confirmed");
    expect(metaStatusDetail({ ...base, publishedBefore: true })).toContain("confirmed by Meta");
  });

  it("uses the exact wording for a missing Instagram professional account", () => {
    expect(metaStatusDetail({ ...base, platform: "instagram", instagramFound: false })).toBe(
      "Instagram Professional account not found for this Facebook Page.",
    );
  });
});
