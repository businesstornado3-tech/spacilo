/**
 * Video worker pairing.
 *
 * A computer that is going to make videos exchanges the short setup code the
 * founder can see in the console for its own access token. The token is
 * returned once, to the machine only, and EarnRoom keeps just a hash of it —
 * so no secret is ever displayed, copied, or emailed by a person.
 *
 * A code is single-use and expires. The worker sends only a name and its own
 * hardware description; it is never sent renter or host data.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { normaliseHardware } from "@/lib/marketing/workers";

const BODY = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(16)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  label: z.string().trim().min(2).max(80).optional(),
  hardware: z.record(z.string(), z.unknown()).optional(),
  installedModels: z.array(z.string().max(120)).max(50).optional(),
});

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/video-worker/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = BODY.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid pairing request" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pairing } = await supabaseAdmin
          .from("marketing_video_worker_pairings" as never)
          .select("id, label, mode, expires_at, claimed_at")
          .eq("code" as never, body.code)
          .maybeSingle();

        const row = pairing as {
          id: string;
          label: string;
          mode: string;
          expires_at: string;
          claimed_at: string | null;
        } | null;
        if (!row) return json({ error: "That setup code is not recognised." }, 401);
        if (row.claimed_at) return json({ error: "That setup code has already been used." }, 409);
        if (Date.parse(row.expires_at) < Date.now())
          return json({ error: "That setup code has expired. Create a new one." }, 410);

        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const hardware = body.hardware ? normaliseHardware(body.hardware) : null;

        const { data: worker, error } = await supabaseAdmin
          .from("marketing_video_workers" as never)
          .insert({
            mode: row.mode,
            label: body.label ?? row.label,
            token_hash: await hashToken(token),
            status: "ONLINE",
            status_detail: "Paired and waiting for work.",
            enabled: true,
            ...(hardware
              ? { hardware: body.hardware as object, capability: hardware.capability }
              : {}),
            ...(body.installedModels ? { installed_models: body.installedModels } : {}),
            last_heartbeat_at: new Date().toISOString(),
          } as never)
          .select("id")
          .single();
        if (error || !worker) return json({ error: "This computer could not be paired." }, 500);

        const workerId = (worker as { id: string }).id;
        await supabaseAdmin
          .from("marketing_video_worker_pairings" as never)
          .update({ claimed_at: new Date().toISOString(), worker_id: workerId } as never)
          .eq("id" as never, row.id);

        await supabaseAdmin.from("marketing_audit" as never).insert({
          action: "video_worker_paired",
          actor: "system",
          detail: `A computer paired as "${body.label ?? row.label}".`,
        } as never);

        return json(
          {
            workerId,
            token,
            heartbeatUrl: new URL("/api/public/video-worker/heartbeat", request.url).toString(),
          },
          200,
        );
      },
    },
  },
});
