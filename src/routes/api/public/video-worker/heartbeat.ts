/**
 * Video worker heartbeat.
 *
 * A worker runs outside EarnRoom — on the founder's own machine or a rented
 * one — so it needs a fixed URL to report in to. It authenticates with the
 * access token issued at registration, which is only ever compared as a hash.
 *
 * The worker sends hardware and status; it is never sent renter or host data,
 * and this endpoint returns nothing beyond the acknowledgement.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { normaliseHardware } from "@/lib/marketing/workers";

const BODY = z.object({
  status: z
    .enum([
      "ONLINE",
      "IDLE",
      "BUSY",
      "LOADING_MODEL",
      "MODEL_READY",
      "OFFLINE",
      "ERROR",
      "AUTHENTICATION_FAILED",
      "QUOTA_EXHAUSTED",
      "PAUSED",
    ])
    .default("IDLE"),
  detail: z.string().max(300).optional(),
  queued: z.number().int().min(0).max(1000).optional(),
  hardware: z.record(z.string(), z.unknown()).optional(),
  installedModels: z.array(z.string().max(120)).max(50).optional(),
  installedVoices: z.array(z.string().max(120)).max(50).optional(),
  installedAudio: z.array(z.string().max(120)).max(200).optional(),
  error: z.string().max(500).nullable().optional(),
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

export const Route = createFileRoute("/api/public/video-worker/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
        if (token.length < 32) return json({ error: "Unauthorised" }, 401);

        const parsed = BODY.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid heartbeat" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: worker } = await supabaseAdmin
          .from("marketing_video_workers" as never)
          .select("id")
          .eq("token_hash" as never, await hashToken(token))
          .maybeSingle();
        if (!worker) return json({ error: "Unauthorised" }, 401);

        const body = parsed.data;
        const hardware = body.hardware ? normaliseHardware(body.hardware) : null;

        await supabaseAdmin
          .from("marketing_video_workers" as never)
          .update({
            status: body.status,
            status_detail: body.detail ?? "Reported by the worker.",
            queued: body.queued ?? 0,
            last_heartbeat_at: new Date().toISOString(),
            last_error: body.error ?? null,
            ...(hardware
              ? { hardware: body.hardware as object, capability: hardware.capability }
              : {}),
            ...(body.installedModels ? { installed_models: body.installedModels } : {}),
            ...(body.installedVoices ? { installed_voices: body.installedVoices } : {}),
            ...(body.installedAudio ? { installed_audio: body.installedAudio } : {}),
          } as never)
          .eq("id" as never, (worker as { id: string }).id);

        return json({ ok: true }, 200);
      },
    },
  },
});
