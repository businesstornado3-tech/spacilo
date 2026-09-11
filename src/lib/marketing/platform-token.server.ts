/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing tables were added after the generated Supabase types were last
 * produced, so the query builder is untyped here.
 */
/**
 * The stored authorisation for LinkedIn, TikTok and Pinterest — server only.
 *
 * Decrypts inside this module and returns null with an honest reason rather
 * than throwing. The token itself never leaves the server and is never logged.
 */
export type StoredPlatformToken = { token: string | null; detail: string };

const LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

export async function platformAccessToken(platform: string): Promise<StoredPlatformToken> {
  const label = LABEL[platform] ?? platform;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken } = await import("@/lib/marketing/token-crypto.server");
  const { data: row } = await (supabaseAdmin as unknown as {
    from: (table: string) => any;
  })
    .from("marketing_platform_tokens")
    .select("access_token_cipher, expires_at")
    .eq("platform", platform)
    .maybeSingle();
  if (!row?.access_token_cipher) {
    return { token: null, detail: `${label} is not connected yet.` };
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return { token: null, detail: `The ${label} authorisation has expired. Reconnect ${label}.` };
  }
  try {
    return { token: await decryptToken(row.access_token_cipher), detail: "Stored authorisation read." };
  } catch {
    return {
      token: null,
      detail: `The stored ${label} authorisation could not be read. Reconnect ${label}.`,
    };
  }
}
