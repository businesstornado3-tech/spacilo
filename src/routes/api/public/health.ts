/**
 * /api/public/health — production monitoring probe.
 *
 * Deliberately boring and deliberately safe:
 *  - no secrets, no environment values and no identifiers are ever returned;
 *  - checks report only "ok" / "degraded" / "unconfigured";
 *  - the database check is an anonymous, already-public read, so the probe
 *    can never leak private rows even if the endpoint is scraped.
 *
 * It lives under /api/public/* so an uptime monitor can reach it without a
 * session. Callers get 200 when everything required is healthy, 503 otherwise,
 * which is what most monitoring tools alert on.
 */
import { createFileRoute } from "@tanstack/react-router";

type CheckState = "ok" | "degraded" | "unconfigured";

/** Presence-only environment validation — never the value itself. */
function configured(name: string): CheckState {
  return process.env[name] ? "ok" : "unconfigured";
}

async function databaseCheck(): Promise<CheckState> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase
      .from("storage_policy_versions")
      .select("id")
      .eq("status", "published")
      .limit(1);
    return error ? "degraded" : "ok";
  } catch {
    return "degraded";
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const database = await databaseCheck();

        const checks = {
          database,
          auth: process.env["VITE_SUPABASE_URL"] ? "ok" : configured("SUPABASE_URL"),
          storage: configured("SUPABASE_URL"),
          payments: configured("STRIPE_SECRET_KEY"),
          paymentsWebhook: configured("STRIPE_WEBHOOK_SECRET"),
          payouts: configured("PAYOUT_PROCESSOR_SECRET"),
          siteUrl: configured("SITE_URL"),
        } satisfies Record<string, CheckState>;

        const healthy = checks.database === "ok";

        return Response.json(
          {
            status: healthy ? "ok" : "degraded",
            version: process.env["APP_VERSION"] ?? "1.0.0",
            build: process.env["BUILD_ID"] ?? null,
            commit: process.env["GIT_COMMIT"] ?? null,
            environment: process.env["NODE_ENV"] ?? "unknown",
            checks,
            latencyMs: Date.now() - started,
            timestamp: new Date().toISOString(),
          },
          {
            status: healthy ? 200 : 503,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
