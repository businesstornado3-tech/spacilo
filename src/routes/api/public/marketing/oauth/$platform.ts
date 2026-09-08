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

/**
 * Sends the browser straight back to a clean EarnRoom page.
 *
 * The authorisation code arrives in this request's own URL and is used only
 * server-side; redirecting immediately means it is never left on screen. The
 * destination carries a plain-language outcome only — never a code or token.
 */
function back(platform: string, outcome: { ok: boolean; message: string }): Response {
  const base =
    platform === "youtube" || platform === "youtube_shorts"
      ? "/admin/youtube-verification-demo"
      : "/admin/marketing";
  const query = outcome.ok
    ? "connected=1"
    : `connect_error=${encodeURIComponent(outcome.message)}`;
  return new Response(null, {
    status: 303,
    headers: { location: `${base}?${query}`, "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/marketing/oauth/$platform")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const platform = params.platform as PlatformId;
        const page = (title: string, message: string, ok: boolean) =>
          back(platform, { ok, message: ok ? title : message });
        if (!PLATFORMS.includes(platform))
          return back("unknown", { ok: false, message: "That platform is not supported." });

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const denied = url.searchParams.get("error");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken } = await import("@/lib/marketing/token-crypto.server");
        const def = oauthDefinition(platform);

        /**
         * Records a plain-language reason on the connection row so the founder
         * console can explain what happened. Never records a code, token or
         * secret value — only the stage and the platform's own error name.
         */
        const fail = async (stage: string, title: string, message: string) => {
          console.log(`[marketing-oauth] ${platform} ${stage}`);
          await supabaseAdmin.from("marketing_platform_connections").upsert(
            {
              platform,
              connection: "NOT_CONNECTED",
              last_error: `${stage}: ${message}`,
              last_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "platform" },
          );
          return page(title, message, false);
        };

        if (denied) {
          // Google/TikTok/Meta send the refusal reason here. `access_denied`
          // from Google most often means the signed-in account is not on the
          // app's test-user list while the app is still in Testing.
          const reason =
            denied === "access_denied"
              ? "The platform refused the authorisation (access_denied). Sign in with the account that is listed as an approved test user for the application, and accept every requested permission."
              : `The platform reported "${denied}" instead of an authorisation.`;
          return fail("AUTHORISATION_REFUSED", "Not connected", reason);
        }
        if (!code || !state) {
          return fail(
            "NO_CODE_RETURNED",
            "Not connected",
            "The platform returned to EarnRoom without an authorisation code.",
          );
        }

        const { data: stateRow } = await supabaseAdmin
          .from("marketing_oauth_states")
          .select("state, platform, redirect_uri, expires_at, used_at")
          .eq("state", state)
          .maybeSingle();
        if (!stateRow || stateRow.platform !== platform) {
          return fail("STATE_NOT_RECOGNISED", "Not connected", "This sign-in request was not recognised.");
        }
        if (stateRow.used_at) {
          return fail("STATE_ALREADY_USED", "Not connected", "This sign-in link has already been used.");
        }
        if (Date.parse(stateRow.expires_at) <= Date.now()) {
          return fail(
            "STATE_EXPIRED",
            "Not connected",
            "This sign-in link has expired. Start again from the studio.",
          );
        }

        const clientId = process.env[def.clientIdSecret];
        const clientSecret = process.env[def.clientSecretSecret];
        if (!clientId || !clientSecret) {
          return fail(
            "CONFIGURATION_MISSING",
            "Not connected",
            "This platform is not set up on the server yet.",
          );
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
          const providerError =
            typeof payload["error"] === "string"
              ? (payload["error"] as string)
              : typeof payload["error_description"] === "string"
                ? (payload["error_description"] as string)
                : "no reason given";
          return fail(
            "CODE_EXCHANGE_FAILED",
            "Not connected",
            `The platform did not return an authorisation (${providerError}).`,
          );
        }

        const refreshToken =
          typeof payload["refresh_token"] === "string" ? (payload["refresh_token"] as string) : null;
        const expiresIn = typeof payload["expires_in"] === "number" ? payload["expires_in"] : null;
        const scopeText = typeof payload["scope"] === "string" ? (payload["scope"] as string) : "";
        const scopes = scopeText ? scopeText.split(/[ ,]+/).filter(Boolean) : [...def.scopes];
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

        let storeError: string | null = null;
        try {
          const { error } = await supabaseAdmin.from("marketing_platform_tokens").upsert(
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
          if (error) storeError = error.message;
        } catch (caught) {
          storeError = caught instanceof Error ? caught.message : "unknown storage failure";
        }
        if (storeError) {
          return fail(
            "TOKEN_STORAGE_FAILED",
            "Not connected",
            `The authorisation could not be saved securely (${storeError}).`,
          );
        }


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
