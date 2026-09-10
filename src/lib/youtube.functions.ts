/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here.
 */
/**
 * YouTube destination selection — server side only.
 *
 * The founder connects the Google account once through the existing OAuth
 * flow; this chooses which of that account's channels EarnRoom publishes to
 * and stores it as the destination. No new OAuth client, no new scopes, no
 * second connection for Shorts.
 *
 * SECURITY
 * - Every handler re-checks `is_platform_admin(auth.uid())`.
 * - The access token is decrypted server side only and never returned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { YoutubeChannel } from "@/lib/marketing/youtube";

export type YoutubeDestinationState = {
  /** Whether a stored YouTube authorisation exists at all. */
  connected: boolean;
  /** The channel currently selected as the publishing destination. */
  channelId: string | null;
  channelLabel: string | null;
  /** Shorts always follow the same channel; never a second connection. */
  shortsFollowsChannel: true;
  detail: string;
};

async function assertAdmin(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

async function readState(supabase: any): Promise<YoutubeDestinationState> {
  const { data: row } = await supabase
    .from("marketing_platform_connections")
    .select("connection, account_id, account_label")
    .eq("platform", "youtube")
    .maybeSingle();

  const connected = row?.connection === "CONNECTED";
  const channelId = row?.account_id ?? null;
  return {
    connected,
    channelId,
    channelLabel: row?.account_label ?? null,
    shortsFollowsChannel: true,
    detail: !connected
      ? "No YouTube account is connected yet."
      : channelId
        ? "A destination channel is selected; YouTube and Shorts both publish to it."
        : "Connected, but no destination channel has been chosen yet.",
  };
}

export const getYoutubeDestination = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YoutubeDestinationState> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    return readState(supabase);
  });

/** Reads the channels the stored authorisation actually owns, from YouTube. */
export const listYoutubeChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ ok: boolean; detail: string; channels: YoutubeChannel[] }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { youtubeAccessToken } = await import("@/lib/marketing/youtube-token.server");
      const { fetchYoutubeChannels } = await import("@/lib/marketing/youtube");

      const { token, detail } = await youtubeAccessToken();
      if (!token) return { ok: false, detail, channels: [] };
      return fetchYoutubeChannels(fetch, token);
    },
  );

/** Persists the founder's chosen channel as the publishing destination. */
export const selectYoutubeChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ channelId: z.string().min(1).max(64) }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; detail: string; state: YoutubeDestinationState }> => {
      const supabase = context.supabase as any;
      await assertAdmin(supabase);
      const { youtubeAccessToken } = await import("@/lib/marketing/youtube-token.server");
      const { fetchYoutubeChannels } = await import("@/lib/marketing/youtube");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { token, detail } = await youtubeAccessToken();
      if (!token) return { ok: false, detail, state: await readState(supabase) };

      // The channel is confirmed against YouTube itself, so a destination can
      // never be stored for a channel the authorisation does not own.
      const result = await fetchYoutubeChannels(fetch, token);
      const channel = result.channels.find((entry) => entry.id === data.channelId);
      if (!channel) {
        return {
          ok: false,
          detail: result.ok
            ? "That channel is not one the connected Google account owns."
            : result.detail,
          state: await readState(supabase),
        };
      }

      const nowIso = new Date().toISOString();
      await (supabaseAdmin as any).from("marketing_platform_connections").upsert(
        {
          platform: "youtube",
          connection: "CONNECTED",
          account_id: channel.id,
          account_label: channel.handle ? `${channel.title} (${channel.handle})` : channel.title,
          last_error: null,
          last_checked_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "platform" },
      );

      await supabase.from("marketing_audit").insert({
        action: "youtube_channel_selected",
        detail: `YouTube destination channel selected: ${channel.title}. Shorts publish to the same channel.`,
        actor: "human",
        actor_id: context.userId,
      });

      return {
        ok: true,
        detail: `Publishing to ${channel.title}. YouTube Shorts use this same channel.`,
        state: await readState(supabase),
      };
    },
  );
