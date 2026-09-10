/**
 * The stored YouTube authorisation — server side only.
 *
 * Decrypts the token inside this module, refreshes it against Google when it
 * has expired, and returns null with an honest reason rather than throwing.
 * The token itself never leaves the server.
 */

export type YoutubeTokenResult = { token: string | null; detail: string };

export async function youtubeAccessToken(): Promise<YoutubeTokenResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken, encryptToken } = await import("@/lib/marketing/token-crypto.server");
  const { data: row } = await (supabaseAdmin as any)
    .from("marketing_platform_tokens")
    .select("platform, access_token_cipher, refresh_token_cipher, expires_at")
    .eq("platform", "youtube")
    .maybeSingle();
  if (!row) {
    return {
      token: null,
      detail: "No YouTube authorisation is stored yet. Connect the channel first.",
    };
  }

  const expired = row.expires_at ? Date.parse(row.expires_at) <= Date.now() + 30_000 : false;
  if (!expired) {
    try {
      return {
        token: await decryptToken(row.access_token_cipher),
        detail: "Stored authorisation in use.",
      };
    } catch {
      return {
        token: null,
        detail: "The stored authorisation could not be read. Reconnect the channel.",
      };
    }
  }

  if (!row.refresh_token_cipher) {
    return {
      token: null,
      detail:
        "The authorisation has expired and Google returned no refresh token. Reconnect the channel.",
    };
  }
  const clientId = process.env["YOUTUBE_CLIENT_ID"];
  const clientSecret = process.env["YOUTUBE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return {
      token: null,
      detail: "The Google application credentials are not configured on this server.",
    };
  }
  try {
    const refresh = await decryptToken(row.refresh_token_cipher);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const token = typeof payload["access_token"] === "string" ? payload["access_token"] : null;
    if (!response.ok || !token) {
      return {
        token: null,
        detail: "Google refused to refresh the authorisation. Reconnect the channel.",
      };
    }
    const expiresIn = typeof payload["expires_in"] === "number" ? payload["expires_in"] : 3600;
    await (supabaseAdmin as any)
      .from("marketing_platform_tokens")
      .update({
        access_token_cipher: await encryptToken(token),
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("platform", "youtube");
    return { token, detail: "Authorisation refreshed with Google." };
  } catch {
    return {
      token: null,
      detail: "The stored authorisation could not be refreshed. Reconnect the channel.",
    };
  }
}
