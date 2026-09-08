/**
 * Official OAuth callback for publishing platforms.
 *
 * The founder signs in on the platform's own screen; the platform sends the
 * authorisation code back here. This handler exchanges it for a token on the
 * server, encrypts the token and records the connection. It never receives or
 * stores a platform password, and it returns nothing sensitive to the browser.
 *
 * The `state` value is a one-time server-issued record, so an unsolicited call
 * to this endpoint cannot connect anything.
 */
import { createFileRoute } from "@tanstack/react-router";

import { oauthDefinition } from "@/lib/marketing/oauth";
import type { PlatformId } from "@/lib/marketing/types";

const PLATFORMS = [
  "youtube",
  "youtube_shorts",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "pinterest",
];

function page(title: string, message: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui;padding:2rem;max-width:34rem">` +
      `<h1 style="font-size:1.25rem">${title}</h1><p>${message}</p>` +
      `<p><a href="/admin/marketing">Back to the marketing studio</a></p></body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/marketing/oauth/$platform")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const platform = params.platform as PlatformId;
        if (!PLATFORMS.includes(platform)) return page("Unknown platform", "That platform is not supported.", false);

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const denied = url.searchParams.get("error");
        if (denied) return page("Not connected", "The platform reported that permission was not granted.", false);
        if (!code || !state) return page("Not connected", "The platform did not return an authorisation code.", false);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken } = await import("@/lib/marketing/token-crypto.server");
        const def = oauthDefinition(platform);

        const { data: stateRow } = await supabaseAdmin
          .from("marketing_oauth_states")
          .select("state, platform, redirect_uri, expires_at, used_at")
          .eq("state", state)
          .maybeSingle();
        if (!stateRow || stateRow.platform !== platform) {
          return page("Not connected", "This sign-in request was not recognised.", false);
        }
        if (stateRow.used_at) return page("Not connected", "This sign-in link has already been used.", false);
        if (Date.parse(stateRow.expires_at) <= Date.now()) {
          return page("Not connected", "This sign-in link has expired. Start again from the studio.", false);
        }

        const clientId = process.env[def.clientIdSecret];
        const clientSecret = process.env[def.clientSecretSecret];
        if (!clientId || !clientSecret) {
          return page("Not connected", "This platform is not set up on the server yet.", false);
        }

        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: stateRow.redirect_uri,
        });
        if (platform === "tiktok") {
          body.set("client_key", clientId);
          body.set("client_secret", clientSecret);
        } else {
          body.set("client_id", clientId);
          body.set("client_secret", clientSecret);
        }

        let payload: Record<string, unknown> = {};
        let ok = false;
        try {
          const response = await fetch(def.tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          });
          payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          ok = response.ok;
        } catch {
          ok = false;
        }

        const accessToken =
          typeof payload["access_token"] === "string"
            ? (payload["access_token"] as string)
            : typeof (payload["data"] as Record<string, unknown> | undefined)?.["access_token"] ===
                "string"
              ? ((payload["data"] as Record<string, unknown>)["access_token"] as string)
              : null;

        if (!ok || !accessToken) {
          await supabaseAdmin
            .from("marketing_platform_connections")
            .upsert(
              {
                platform,
                connection: "NOT_CONNECTED",
                last_error: "The platform did not return an authorisation.",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "platform" },
            );
          return page("Not connected", "The platform did not return an authorisation.", false);
        }

        const refreshToken =
          typeof payload["refresh_token"] === "string" ? (payload["refresh_token"] as string) : null;
        const expiresIn = typeof payload["expires_in"] === "number" ? payload["expires_in"] : null;
        const scopeText = typeof payload["scope"] === "string" ? (payload["scope"] as string) : "";
        const scopes = scopeText ? scopeText.split(/[ ,]+/).filter(Boolean) : [...def.scopes];
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

        await supabaseAdmin.from("marketing_platform_tokens").upsert(
          {
            platform,
            access_token_cipher: await encryptToken(accessToken),
            refresh_token_cipher: refreshToken ? await encryptToken(refreshToken) : null,
            scopes,
            expires_at: expiresAt,
            obtained_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "platform" },
        );

        await supabaseAdmin.from("marketing_platform_connections").upsert(
          {
            platform,
            connection: "CONNECTED",
            scopes,
            expires_at: expiresAt,
            last_error: null,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "platform" },
        );

        await supabaseAdmin
          .from("marketing_oauth_states")
          .update({ used_at: new Date().toISOString() })
          .eq("state", state);

        await supabaseAdmin.from("marketing_audit").insert({
          action: "platform_connected",
          detail: `${def.label} authorised on the platform's own sign-in screen.`,
          actor: "human",
        });

        return page(
          `${def.label} connected`,
          "The authorisation is stored securely. Choose the destination account in the studio to finish setting it up.",
          true,
        );
      },
    },
  },
});
