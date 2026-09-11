/**
 * LinkedIn, TikTok and Pinterest publishing, with the transport mocked.
 *
 * The single rule under test everywhere: a publication is reported only when
 * the platform itself confirmed it. Every other path must refuse honestly.
 */
import { describe, expect, it, vi } from "vitest";

import { publishLinkedinVideo, fetchLinkedinOrganizations } from "./linkedin";
import { publishPinterestVideoPin, fetchPinterestBoards } from "./pinterest";
import { publishTiktokVideo, resolveTiktokPrivacy } from "./tiktok";

const NOW = Date.parse("2026-06-15T09:00:00Z");
const FILE = new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, ...(headers ? { headers } : {}) });
}

function sequence(responses: Response[]): typeof fetch {
  let index = 0;
  return vi.fn(async () => responses[index++] ?? json({}, 500)) as unknown as typeof fetch;
}

describe("LinkedIn", () => {
  it("publishes only after the bytes are uploaded and LinkedIn returns a post URN", async () => {
    const fetchImpl = sequence([
      FILE.clone(),
      json({
        value: {
          video: "urn:li:video:1",
          uploadToken: "tok",
          uploadInstructions: [{ uploadUrl: "https://upload.linkedin/1", firstByte: 0, lastByte: 3 }],
        },
      }),
      new Response(null, { status: 200, headers: { etag: '"part-1"' } }),
      json({}),
      json({}, 201, { "x-restli-id": "urn:li:share:99" }),
    ]);
    const result = await publishLinkedinVideo({
      fetchImpl,
      accessToken: "token",
      authorUrn: "urn:li:person:abc",
      videoUrl: "https://storage/clip.mp4",
      title: "Make space earn.",
      commentary: "Spare room sitting empty?",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, platformPostId: "urn:li:share:99" });
    expect((result as { mediaId?: string }).mediaId).toBe("urn:li:video:1");
  });

  it("does not claim a publication when LinkedIn returns no post id", async () => {
    const fetchImpl = sequence([
      FILE.clone(),
      json({
        value: {
          video: "urn:li:video:1",
          uploadToken: "tok",
          uploadInstructions: [{ uploadUrl: "https://upload.linkedin/1", firstByte: 0, lastByte: 3 }],
        },
      }),
      new Response(null, { status: 200, headers: { etag: '"p"' } }),
      json({}),
      json({}, 200),
    ]);
    const result = await publishLinkedinVideo({
      fetchImpl,
      accessToken: "token",
      authorUrn: "urn:li:person:abc",
      videoUrl: "https://storage/clip.mp4",
      title: "t",
      commentary: "c",
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("reports no Company Page rather than inventing one when LinkedIn refuses", async () => {
    const fetchImpl = sequence([json({ message: "no" }, 403)]);
    const result = await fetchLinkedinOrganizations(fetchImpl, "token");
    expect(result.organizations).toEqual([]);
    expect(result.detail).toMatch(/Company Page/i);
  });
});

describe("TikTok", () => {
  it("never sends a privacy level TikTok did not offer", () => {
    const only = resolveTiktokPrivacy(["SELF_ONLY"], "PUBLIC_TO_EVERYONE");
    expect(only.ok && only.value).toBe("SELF_ONLY");
    expect(resolveTiktokPrivacy([], null).ok).toBe(false);
  });

  it("publishes only on PUBLISH_COMPLETE and reports actual visibility", async () => {
    const fetchImpl = sequence([
      json({ data: { creator_username: "earnroom", privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 300 } }),
      json({ data: { publish_id: "pub-1" } }),
      json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["777"] } }),
    ]);
    const result = await publishTiktokVideo({
      fetchImpl,
      accessToken: "token",
      videoUrl: "https://storage/clip.mp4",
      title: "Spare room sitting empty?",
      seconds: 30,
      requestedPrivacy: null,
      now: NOW,
      sleep: async () => {},
    });
    expect(result.ok).toBe(true);
    expect((result as { note?: string }).note).toMatch(/not publicly visible/i);
  });

  it("refuses when TikTok reports a failed publish", async () => {
    const fetchImpl = sequence([
      json({ data: { creator_username: "earnroom", privacy_level_options: ["SELF_ONLY"] } }),
      json({ data: { publish_id: "pub-1" } }),
      json({ data: { status: "FAILED", fail_reason: "video_format_check_failed" } }),
    ]);
    const result = await publishTiktokVideo({
      fetchImpl,
      accessToken: "token",
      videoUrl: "https://storage/clip.mp4",
      title: "t",
      seconds: 30,
      requestedPrivacy: null,
      now: NOW,
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("Pinterest", () => {
  it("refuses to pin when no board has been chosen", async () => {
    const result = await publishPinterestVideoPin({
      fetchImpl: sequence([]),
      accessToken: "token",
      boardId: null,
      videoUrl: "https://storage/clip.mp4",
      coverImageUrl: null,
      title: "t",
      description: "d",
      link: "https://earnroom.co.uk",
      now: NOW,
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/board/i);
  });

  it("creates the Pin only after Pinterest finished processing the media", async () => {
    const fetchImpl = sequence([
      FILE.clone(),
      json({ media_id: "media-1", upload_url: "https://upload.pinterest", upload_parameters: {} }),
      new Response(null, { status: 204 }),
      json({ status: "succeeded" }),
      json({ id: "pin-1" }, 201),
    ]);
    const result = await publishPinterestVideoPin({
      fetchImpl,
      accessToken: "token",
      boardId: "board-1",
      videoUrl: "https://storage/clip.mp4",
      coverImageUrl: null,
      title: "t",
      description: "d",
      link: "https://earnroom.co.uk",
      now: NOW,
      sleep: async () => {},
    });
    expect(result).toMatchObject({ ok: true, platformPostId: "pin-1" });
  });

  it("passes Pinterest's own refusal through instead of a generic message", async () => {
    const fetchImpl = sequence([json({ message: "Standard access required" }, 403)]);
    const boards = await fetchPinterestBoards(fetchImpl, "token");
    expect(boards.ok).toBe(false);
    if (!boards.ok) expect(boards.error).toMatch(/Standard access/i);
  });
});
