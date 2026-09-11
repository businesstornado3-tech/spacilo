/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here.
 */
/**
 * Destination discovery for LinkedIn, TikTok and Pinterest.
 *
 * This is NOT a second publishing system: it only reads, from the platform's
 * own API, the destinations a founder may choose between, and records the
 * chosen one on the SAME connection row every other platform already uses.
 *
 * Nothing here invents a destination, creates one, or chooses one silently.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runtimeFetch } from "@/lib/marketing/runtime-fetch";

async function assertAdmin(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

export type DestinationOption = { id: string; label: string; detail: string | null };

export type DestinationSnapshot = {
  platform: "linkedin" | "tiktok" | "pinterest";
  connected: boolean;
  /** The signed-in account, when the platform returned one. */
  account: string | null;
  /** What the founder can choose between. Empty when the platform returned none. */
  options: DestinationOption[];
  /** The destination already chosen, if any. */
  selectedId: string | null;
  selectedLabel: string | null;
  /** Plain-language state, including any platform restriction. */
  detail: string;
  /** TikTok: whether public posting is actually available to this app today. */
  publicPostingAvailable: boolean | null;
};

/**
 * Reads the real destinations from the platform: LinkedIn authors (the member
 * plus any organisation they actually administer), the TikTok creator's own
 * settings, or the Pinterest boards that exist on the account.
 */
export const getPlatformDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ platform: z.enum(["linkedin", "tiktok", "pinterest"]) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<DestinationSnapshot> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const platform = data.platform;

    const { data: row } = await supabase
      .from("marketing_platform_connections")
      .select("connection, account_id, account_label, destination_id, destination_label")
      .eq("platform", platform)
      .maybeSingle();

    const base: DestinationSnapshot = {
      platform,
      connected: row?.connection === "CONNECTED",
      account: row?.account_label ?? null,
      options: [],
      selectedId: row?.destination_id ?? null,
      selectedLabel: row?.destination_label ?? null,
      detail: "",
      publicPostingAvailable: null,
    };
    if (!base.connected) {
      return { ...base, detail: "Not connected yet." };
    }

    const { platformAccessToken } = await import("@/lib/marketing/platform-token.server");
    const stored = await platformAccessToken(platform);
    if (!stored.token) return { ...base, detail: stored.detail };

    if (platform === "linkedin") {
      const { fetchLinkedinMember, fetchLinkedinOrganizations } = await import(
        "@/lib/marketing/linkedin"
      );
      const member = await fetchLinkedinMember(runtimeFetch, stored.token);
      if (!member.ok) return { ...base, detail: member.error };
      const orgs = await fetchLinkedinOrganizations(runtimeFetch, stored.token);
      return {
        ...base,
        account: member.value.name,
        options: [
          { id: member.value.urn, label: `${member.value.name} (your profile)`, detail: null },
          ...orgs.organizations.map((entry) => ({
            id: entry.urn,
            label: entry.name,
            detail: "Company Page you administer",
          })),
        ],
        detail: orgs.detail,
      };
    }

    if (platform === "tiktok") {
      const { fetchTiktokCreatorInfo } = await import("@/lib/marketing/tiktok");
      const info = await fetchTiktokCreatorInfo(runtimeFetch, stored.token);
      if (!info.ok) return { ...base, detail: info.error };
      const options = info.value.privacyOptions;
      return {
        ...base,
        account: info.value.username ? `@${info.value.username}` : base.account,
        options: options.map((entry) => ({
          id: entry,
          label: entry.replaceAll("_", " ").toLowerCase(),
          detail: entry === "PUBLIC_TO_EVERYONE" ? "Visible to everyone" : "Not publicly visible",
        })),
        publicPostingAvailable: options.includes("PUBLIC_TO_EVERYONE"),
        detail: options.includes("PUBLIC_TO_EVERYONE")
          ? "TikTok allows public posting for this account."
          : "TikTok is not offering public posting for this app yet — a post can only be made private or shared with followers until TikTok audits the app.",
      };
    }

    const { fetchPinterestAccount, fetchPinterestBoards } = await import(
      "@/lib/marketing/pinterest"
    );
    const account = await fetchPinterestAccount(runtimeFetch, stored.token);
    const boards = await fetchPinterestBoards(runtimeFetch, stored.token);
    if (!boards.ok) return { ...base, detail: boards.error };
    return {
      ...base,
      account: account.ok ? `@${account.value.username}` : base.account,
      options: boards.value.map((board) => ({
        id: board.id,
        label: board.name,
        detail: board.privacy,
      })),
      detail: boards.value.length
        ? "Choose the board this campaign should pin to."
        : "This Pinterest account has no board yet. Create one on Pinterest, then choose it here.",
    };
  });

/** Records the founder's chosen destination on the existing connection row. */
export const selectPlatformDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        platform: z.enum(["linkedin", "tiktok", "pinterest"]),
        destinationId: z.string().min(1).max(300),
        destinationLabel: z.string().min(1).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; detail: string }> => {
    const supabase = context.supabase as any;
    await assertAdmin(supabase);
    const { error } = await supabase
      .from("marketing_platform_connections")
      .update({
        destination_id: data.destinationId,
        destination_label: data.destinationLabel,
        updated_at: new Date().toISOString(),
      })
      .eq("platform", data.platform);
    if (error) return { ok: false, detail: "That choice could not be saved." };
    await supabase.from("marketing_audit").insert({
      action: "platform_destination_selected",
      detail: `${data.platform}: ${data.destinationLabel}`,
      actor: "human",
      actor_id: context.userId,
    });
    return { ok: true, detail: `Saved: ${data.destinationLabel}.` };
  });
