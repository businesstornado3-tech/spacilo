/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here. Every row read below is
 * narrowed explicitly into the typed shapes exported from
 * `@/lib/marketing/youtube-demo`.
 */
/**
 * Google OAuth verification demo — server side only.
 *
 * SECURITY
 * - Every function re-checks `is_platform_admin(auth.uid())`; the table's RLS
 *   policies are the real boundary.
 * - Stored authorisations are decrypted inside these handlers only. No access
 *   token, refresh token or client secret is ever returned to the browser,
 *   written to the audit trail, or shown on the page.
 * - Nothing here simulates Google. The channel details and the video id come
 *   from real YouTube Data API responses or the call fails honestly.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  YOUTUBE_DEMO_SCOPES,
  clientHint,
  demoRecordingPath,
  redactSensitive,
  type DemoRunView,
  type DemoRunStatus,
  type RecordingStatus,
} from "@/lib/marketing/youtube-demo";

const BUCKET = "marketing-videos";
const TABLE = "marketing_youtube_demo_runs";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

function siteUrl(): string {
  return process.env["PUBLIC_SITE_URL"] ?? "https://earnroom.co.uk";
}

async function rowToRun(admin: any, row: any): Promise<DemoRunView> {
  let recordingUrl: string | null = null;
  if (row.recording_path) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(row.recording_path, 3600);
    recordingUrl = data?.signedUrl ?? null;
  }
  return {
    id: row.id,
    status: row.status as DemoRunStatus,
    scopes: row.scopes ?? [],
    environment: row.environment ?? null,
    channel: (row.channel ?? null) as DemoRunView["channel"],
    marketingVideoId: row.marketing_video_id ?? null,
    youtubeVideoId: row.youtube_video_id ?? null,
    youtubeUrl: row.youtube_url ?? null,
    recordingStatus: (row.recording_status ?? "NOT_STARTED") as RecordingStatus,
    recordingBytes: row.recording_bytes ?? null,
    recordingMime: row.recording_mime ?? null,
    recordingUrl,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Decrypts the stored YouTube authorisation, refreshing it against Google when
 * it has expired. Returns null rather than throwing so callers can report an
 * honest "authorisation required" state. Shared with the production YouTube
 * destination and publishing paths.
 */
async function youtubeAccessToken(): Promise<{ token: string | null; detail: string }> {
  const { youtubeAccessToken: read } = await import("@/lib/marketing/youtube-token.server");
  return read();
}

export interface DemoVideoOption {
  id: string;
  campaignId: string;
  platform: string;
  aspect: string;
  seconds: number;
  resolution: string;
  createdAt: string;
  playbackUrl: string | null;
}

export interface YoutubeDemoOverview {
  environment: string;
  callbackUrl: string;
  clientConfigured: boolean;
  clientHint: string;
  scopes: { scope: string; short: string; use: string }[];
  connection: {
    state: string;
    scopes: string[];
    accountId: string | null;
    hasStoredAuthorisation: boolean;
    expiresAt: string | null;
    detail: string;
  };
  videos: DemoVideoOption[];
  runs: DemoRunView[];
}

export const getYoutubeDemoOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YoutubeDemoOverview> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const clientId = process.env["YOUTUBE_CLIENT_ID"] ?? null;
    const secretConfigured = Boolean(process.env["YOUTUBE_CLIENT_SECRET"]);

    const { data: connectionRow } = await supabase
      .from("marketing_platform_connections")
      .select("platform, connection, scopes, expires_at, account_id, last_error")
      .eq("platform", "youtube")
      .maybeSingle();

    const { data: tokenRow } = await admin
      .from("marketing_platform_tokens")
      .select("platform, expires_at")
      .eq("platform", "youtube")
      .maybeSingle();

    const { data: videoRows } = await supabase
      .from("marketing_videos")
      .select("id, campaign_id, platform, aspect, seconds, resolution, storage_path, created_at, status")
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(25);

    const videos: DemoVideoOption[] = await Promise.all(
      ((videoRows ?? []) as any[]).map(async (row) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
        return {
          id: row.id,
          campaignId: row.campaign_id,
          platform: row.platform,
          aspect: row.aspect,
          seconds: row.seconds,
          resolution: row.resolution,
          createdAt: row.created_at,
          playbackUrl: data?.signedUrl ?? null,
        };
      }),
    );

    const { data: runRows } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    const runs = await Promise.all(((runRows ?? []) as any[]).map((row) => rowToRun(admin, row)));

    return {
      environment: siteUrl(),
      callbackUrl: `${siteUrl()}/api/public/marketing/oauth/youtube`,
      clientConfigured: Boolean(clientId && secretConfigured),
      clientHint: clientHint(clientId),
      scopes: YOUTUBE_DEMO_SCOPES.map((entry) => ({ ...entry })),
      connection: {
        state: connectionRow?.connection ?? "NOT_CONNECTED",
        scopes: connectionRow?.scopes ?? [],
        accountId: connectionRow?.account_id ?? null,
        hasStoredAuthorisation: Boolean(tokenRow),
        expiresAt: tokenRow?.expires_at ?? connectionRow?.expires_at ?? null,
        detail: connectionRow?.last_error
          ? redactSensitive(String(connectionRow.last_error))
          : connectionRow?.connection === "CONNECTED"
            ? "A YouTube authorisation is stored on the server."
            : "No YouTube channel is connected yet.",
      },
      videos,
      runs,
    };
  });

/** Starts a demo run and returns Google's own authorisation URL. */
export const startYoutubeDemoRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ ok: boolean; runId: string | null; url: string | null; detail: string }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { authorizeUrl } = await import("@/lib/marketing/oauth");

      const clientId = process.env["YOUTUBE_CLIENT_ID"];
      if (!clientId || !process.env["YOUTUBE_CLIENT_SECRET"]) {
        return {
          ok: false,
          runId: null,
          url: null,
          detail:
            "Requires configuration: the Google application credentials are not set up on this server yet.",
        };
      }

      const redirectUri = `${siteUrl()}/api/public/marketing/oauth/youtube`;
      const oauthState = crypto.randomUUID().replace(/-/g, "");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: stateError } = await (supabaseAdmin as any)
        .from("marketing_oauth_states")
        .insert({
          state: oauthState,
          platform: "youtube",
          created_by: context.userId,
          redirect_uri: redirectUri,
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        });
      if (stateError) {
        return { ok: false, runId: null, url: null, detail: "Could not start the sign-in. Please try again." };
      }

      const { data: run, error } = await supabase
        .from(TABLE)
        .insert({
          created_by: context.userId,
          status: "STARTED",
          scopes: YOUTUBE_DEMO_SCOPES.map((entry) => entry.scope),
          environment: siteUrl(),
          oauth_state: oauthState,
        })
        .select("id")
        .single();
      if (error || !run) {
        return { ok: false, runId: null, url: null, detail: "Could not open a demonstration record." };
      }

      return {
        ok: true,
        runId: run.id,
        url: authorizeUrl({ platform: "youtube", clientId, redirectUri, state: oauthState }),
        detail: "Complete sign-in, two-factor authentication and permissions on Google's own screens.",
      };
    },
  );

/**
 * youtube.readonly, demonstrated for real: reads the authorised channel's own
 * details straight from the YouTube Data API.
 */
export const verifyDemoChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; detail: string; channel: DemoRunView["channel"] }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { token, detail } = await youtubeAccessToken();
      if (!token) return { ok: false, detail, channel: null };

      let payload: Record<string, unknown> = {};
      let status = 0;
      try {
        const response = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        status = response.status;
        payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      } catch {
        return { ok: false, detail: "The request to YouTube could not be completed.", channel: null };
      }
      if (status === 401 || status === 403) {
        // Keep Google's own reason: a disabled API, a missing scope and a
        // revoked authorisation all arrive as 401/403 but need different action.
        const error = (payload["error"] ?? {}) as Record<string, unknown>;
        const first = Array.isArray(error["errors"]) ? ((error["errors"] as any[])[0] ?? {}) : {};
        const reason = typeof first?.reason === "string" ? first.reason : null;
        const message = typeof error["message"] === "string" ? (error["message"] as string) : "";
        const detailText =
          reason === "accessNotConfigured" || message.includes("has not been used in project")
            ? "The YouTube Data API is not switched on for this Google Cloud project yet. Enable YouTube Data API v3 in the project, wait a few minutes, then retry — no need to reconnect."
            : reason === "insufficientPermissions" || reason === "forbidden"
              ? "Google accepted the sign-in but the granted permissions do not cover reading the channel. Reconnect and accept both permissions."
              : status === 401
                ? "YouTube rejected the stored authorisation (it was revoked or has expired). Reconnect the channel."
                : `YouTube refused the request (${reason ?? "no reason given"}).`;
        return {
          ok: false,
          detail: redactSensitive(`HTTP ${status}: ${detailText}`),
          channel: null,
        };
      }

      const items = Array.isArray(payload["items"]) ? (payload["items"] as any[]) : [];
      const first = items[0];
      if (!first?.id) {
        return {
          ok: false,
          detail: "YouTube returned no channel for this account. The Google account has no YouTube channel.",
          channel: null,
        };
      }
      const channel = {
        id: String(first.id),
        title: String(first.snippet?.title ?? "Untitled channel"),
        customUrl: first.snippet?.customUrl ? String(first.snippet.customUrl) : null,
      };

      await supabase
        .from(TABLE)
        .update({ channel, status: "CHANNEL_VERIFIED", updated_at: new Date().toISOString() })
        .eq("id", data.runId);
      await supabase
        .from("marketing_platform_connections")
        .update({ account_id: channel.id, last_checked_at: new Date().toISOString() })
        .eq("platform", "youtube");
      await supabase.from("marketing_audit").insert({
        action: "youtube_demo_channel_verified",
        detail: `Connected channel confirmed with youtube.readonly: ${channel.title}.`,
        actor: "human",
        actor_id: context.userId,
      });

      return { ok: true, detail: "Channel details retrieved from YouTube with youtube.readonly.", channel };
    },
  );

/**
 * youtube.upload, demonstrated for real: sends an approved EarnRoom marketing
 * video to YouTube's resumable upload endpoint and records the identifier
 * YouTube returns. It is uploaded privately, as the production adapter does.
 */
export const uploadDemoVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), videoId: z.string().uuid() }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; detail: string; youtubeVideoId: string | null; youtubeUrl: string | null }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);

      const { data: video } = await supabase
        .from("marketing_videos")
        .select("id, campaign_id, asset_id, storage_path, platform")
        .eq("id", data.videoId)
        .maybeSingle();
      if (!video?.storage_path) {
        return { ok: false, detail: "That video has no stored file.", youtubeVideoId: null, youtubeUrl: null };
      }

      const { data: campaignRow } = await supabase
        .from("marketing_campaigns")
        .select("topic, campaign")
        .eq("id", video.campaign_id)
        .maybeSingle();
      const asset = ((campaignRow?.campaign?.assets ?? []) as any[]).find(
        (entry) => entry.id === video.asset_id,
      );
      const title = String(asset?.title ?? campaignRow?.topic ?? "EarnRoom marketing video").slice(0, 100);
      const description = String(
        asset?.description ?? "EarnRoom — peer-to-peer storage in the UK. https://earnroom.co.uk",
      ).slice(0, 4000);

      const { token, detail } = await youtubeAccessToken();
      if (!token) return { ok: false, detail, youtubeVideoId: null, youtubeUrl: null };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await (supabaseAdmin as any).storage
        .from(BUCKET)
        .createSignedUrl(video.storage_path, 600);
      if (!signed?.signedUrl) {
        return { ok: false, detail: "The stored video file could not be read.", youtubeVideoId: null, youtubeUrl: null };
      }
      const fileResponse = await fetch(signed.signedUrl);
      if (!fileResponse.ok) {
        return { ok: false, detail: "The stored video file could not be downloaded.", youtubeVideoId: null, youtubeUrl: null };
      }
      const bytes = new Uint8Array(await fileResponse.arrayBuffer());

      // Step 1: open a resumable session with the real YouTube Data API.
      const start = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": String(bytes.byteLength),
          },
          body: JSON.stringify({
            snippet: { title, description, tags: asset?.hashtags ?? [] },
            status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
          }),
        },
      );
      const location = start.headers.get("location");
      if (!start.ok || !location) {
        const errorPayload = (await start.json().catch(() => ({}))) as any;
        const message = redactSensitive(
          String(errorPayload?.error?.message ?? `YouTube refused the upload (HTTP ${start.status}).`),
        );
        await supabase.from(TABLE).update({ status: "FAILED", notes: message }).eq("id", data.runId);
        return { ok: false, detail: message, youtubeVideoId: null, youtubeUrl: null };
      }

      // Step 2: send the actual file bytes.
      const put = await fetch(location, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength) },
        body: bytes,
      });
      const payload = (await put.json().catch(() => ({}))) as Record<string, unknown>;
      const youtubeVideoId = typeof payload["id"] === "string" ? (payload["id"] as string) : null;
      if (!put.ok || !youtubeVideoId) {
        const message = redactSensitive(
          String((payload as any)?.error?.message ?? `YouTube did not confirm the upload (HTTP ${put.status}).`),
        );
        await supabase.from(TABLE).update({ status: "FAILED", notes: message }).eq("id", data.runId);
        return { ok: false, detail: message, youtubeVideoId: null, youtubeUrl: null };
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
      await supabase
        .from(TABLE)
        .update({
          status: "UPLOADED",
          marketing_video_id: video.id,
          youtube_video_id: youtubeVideoId,
          youtube_url: youtubeUrl,
          notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.runId);
      await supabase.from("marketing_audit").insert({
        action: "youtube_demo_upload",
        detail: `Verification demonstration uploaded a marketing video to YouTube as ${youtubeVideoId} (private).`,
        actor: "human",
        actor_id: context.userId,
      });

      return {
        ok: true,
        detail: "YouTube accepted the upload and returned a video identifier.",
        youtubeVideoId,
        youtubeUrl,
      };
    },
  );

/** Issues a one-time private upload slot for the founder's screen recording. */
export const createDemoRecordingSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ runId: z.string().uuid(), extension: z.string().min(2).max(5) }).parse(data),
  )
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; path: string | null; token: string | null; detail: string }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const path = demoRecordingPath(data.runId, data.extension);
      const { data: slot, error } = await (supabaseAdmin as any).storage
        .from(BUCKET)
        .createSignedUploadUrl(path, { upsert: true });
      if (error || !slot?.token) {
        return { ok: false, path: null, token: null, detail: "Could not prepare private storage for the recording." };
      }
      await supabase
        .from(TABLE)
        .update({ recording_status: "PROCESSING", updated_at: new Date().toISOString() })
        .eq("id", data.runId);
      return { ok: true, path, token: slot.token, detail: "Private storage ready." };
    },
  );

/** Records that the uploaded file exists and returns its founder-only link. */
export const completeDemoRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        path: z.string().min(5).max(200),
        bytes: z.number().int().nonnegative(),
        mime: z.string().min(3).max(80),
        complete: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; url: string | null; detail: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: object } = await admin.storage
      .from(BUCKET)
      .list("youtube-oauth-demo", { search: data.path.split("/").pop() });
    if (!object?.length) {
      await supabase.from(TABLE).update({ recording_status: "FAILED" }).eq("id", data.runId);
      return { ok: false, url: null, detail: "The recording file was not found in private storage." };
    }

    const { data: current } = await supabase.from(TABLE).select("status").eq("id", data.runId).maybeSingle();
    await supabase
      .from(TABLE)
      .update({
        recording_status: "READY",
        recording_path: data.path,
        recording_bytes: data.bytes,
        recording_mime: data.mime,
        status: data.complete && current?.status === "UPLOADED" ? "COMPLETE" : (current?.status ?? "STARTED"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.runId);

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(data.path, 3600);
    return { ok: true, url: signed?.signedUrl ?? null, detail: "Recording stored privately." };
  });

/** A fresh one-hour founder-only link to a stored recording. */
export const getDemoRecordingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { data: row } = await supabase
      .from(TABLE)
      .select("recording_path")
      .eq("id", data.runId)
      .maybeSingle();
    if (!row?.recording_path) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .createSignedUrl(row.recording_path, 3600);
    return { url: signed?.signedUrl ?? null };
  });
