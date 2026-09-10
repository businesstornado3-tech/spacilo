/**
 * The genuine Windows installer download.
 *
 * The file is named after a short-lived setup session, so the installer can
 * pair the machine by itself: the founder never sees, types or copies a code,
 * and no token is ever put in a link. The session must still exist, be unused
 * and be inside its 30-minute window before a byte is served.
 *
 * If no real installer has been published, this returns "not available" — it
 * never serves a placeholder file.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  pairingCodeFromFileName,
  pairingCodeFromPairFileName,
  pairingScript,
} from "@/lib/marketing/workers/setup";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/video-worker/setup/$file")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const name = String(params.file ?? "");
        const pairOnly = pairingCodeFromPairFileName(name);
        const code = pairOnly ?? pairingCodeFromFileName(name);
        if (!code) return json({ error: "Unknown download." }, 404);

        const upstream = process.env["EARNROOM_WORKER_INSTALLER_URL"];
        // A computer that already has the worker never needs the installer.
        if (!upstream && !pairOnly) {
          return json(
            {
              error:
                "The Windows worker installer has not been published yet, so there is nothing to download.",
            },
            503,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("marketing_video_worker_pairings" as never)
          .select("claimed_at, expires_at, label")
          .eq("code" as never, code)
          .maybeSingle();

        const row = data as {
          claimed_at: string | null;
          expires_at: string;
          label: string | null;
        } | null;
        if (!row) return json({ error: "This setup link is not recognised." }, 404);
        if (row.claimed_at) return json({ error: "This setup link has already been used." }, 409);
        if (Date.parse(row.expires_at) < Date.now()) {
          return json({ error: "This setup link has expired. Start setup again." }, 410);
        }

        if (pairOnly) {
          const site = new URL(request.url).origin;
          const script = pairingScript({
            code,
            site,
            label: row.label ?? "My computer",
          });
          return new Response(script, {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="${name}"`,
              "Cache-Control": "no-store",
            },
          });
        }


        const file = await fetch(upstream!, { redirect: "follow" });
        if (!file.ok || !file.body) {
          return json({ error: "The installer could not be fetched right now." }, 502);
        }

        return new Response(file.body, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${String(params.file)}"`,
            "Cache-Control": "no-store",
            ...(file.headers.get("content-length")
              ? { "Content-Length": file.headers.get("content-length")! }
              : {}),
          },
        });
      },
    },
  },
});
