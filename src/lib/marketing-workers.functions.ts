/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing worker table was added after the generated Supabase types were
 * last produced, so the query builder is untyped here. Every row is narrowed
 * into the typed shapes exported from `@/lib/marketing/workers`.
 */
/**
 * EarnRoom Video Worker registry — server side only.
 *
 * Founder/admin authorisation is re-checked in Postgres on every call. Access
 * tokens are generated here, shown once and stored only as a hash: the plain
 * token never goes back into the database and is never read again.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyWorkerPreferences,
  browserCapability,
  costReport,
  normaliseHardware,
  readWorkerPreferences,
  selectWorker,
  WORKER_LABEL,
  type BrowserProbe,
  type CapabilityClass,
  type WorkerDescriptor,
  type WorkerMode,
  type WorkerPreferences,
  type WorkerRuntimeStatus,
} from "@/lib/marketing/workers";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("You don't have access to this area.");
}

async function loadSettings(supabase: any): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("marketing_settings")
    .select("settings")
    .eq("id", true)
    .maybeSingle();
  return (data?.settings ?? {}) as Record<string, unknown>;
}

function rowToDescriptor(row: any): WorkerDescriptor {
  const hardware = row.hardware && Object.keys(row.hardware).length > 0
    ? normaliseHardware(row.hardware)
    : null;
  return {
    mode: row.mode as WorkerMode,
    id: row.id as string,
    label: row.label as string,
    status: row.status as WorkerRuntimeStatus,
    detail: row.status_detail as string,
    capability: (hardware?.capability ?? (row.capability as CapabilityClass)) satisfies CapabilityClass,
    hardware,
    provider: row.provider ?? null,
    installedModels: (row.installed_models ?? []) as string[],
    enabled: row.enabled === true,
    chargeable: row.mode === "PAID_CLOUD",
    queued: Number(row.queued ?? 0),
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
  };
}

/** A worker is treated as offline once its heartbeat goes quiet. */
const HEARTBEAT_TIMEOUT_MS = 90_000;

function withHeartbeatTimeout(worker: WorkerDescriptor, now: number): WorkerDescriptor {
  if (worker.mode === "BROWSER") return worker;
  const beat = worker.lastHeartbeatAt ? Date.parse(worker.lastHeartbeatAt) : NaN;
  if (Number.isNaN(beat) || now - beat <= HEARTBEAT_TIMEOUT_MS) return worker;
  return {
    ...worker,
    status: "OFFLINE",
    detail: "No signal from this worker recently.",
  };
}

export type VideoWorkerSnapshot = {
  workers: WorkerDescriptor[];
  preferences: WorkerPreferences;
  /** Plain-English note for the founder about the current route. */
  routeSummary: string;
  costLines: { mode: WorkerMode; label: string; line: string }[];
};

async function snapshot(supabase: any, browser: BrowserProbe | null): Promise<VideoWorkerSnapshot> {
  const settings = await loadSettings(supabase);
  const preferences = readWorkerPreferences(settings);
  const { data } = await supabase
    .from("marketing_video_workers")
    .select("*")
    .order("mode", { ascending: true });

  const now = Date.now();
  const stored = ((data ?? []) as any[])
    .filter((row) => row.mode !== "BROWSER")
    .map((row) => withHeartbeatTimeout(rowToDescriptor(row), now));

  // The browser worker is not a database row: it is whatever machine the
  // founder is sitting at, described only from what the page can actually see.
  const capability = browser ? browserCapability(browser) : null;
  const browserWorker: WorkerDescriptor = {
    mode: "BROWSER",
    id: null,
    label: WORKER_LABEL.BROWSER,
    status:
      capability === null
        ? "OFFLINE"
        : capability.status === "UNSUPPORTED"
          ? "ERROR"
          : "IDLE",
    detail: capability?.summary ?? "Not checked on this device yet.",
    capability: capability?.status === "SUPPORTED" ? "MEDIUM" : "LIMITED",
    hardware: null,
    provider: null,
    installedModels: [],
    enabled: true,
    chargeable: false,
    queued: 0,
    lastHeartbeatAt: null,
  };

  const workers = [browserWorker, ...stored];
  const selection = selectWorker({
    preference: preferences.defaultWorker,
    workers,
    request: { seconds: 8, resolution: "720p", aspect: "9:16", voice: false, music: true },
    paidComputeEnabled: preferences.paidComputeEnabled,
  });

  return {
    workers,
    preferences,
    routeSummary: selection.ok ? selection.reason : selection.message,
    costLines: workers.map((worker) => ({
      mode: worker.mode,
      label: worker.label,
      line: costReport({ mode: worker.mode, resolution: "720p", seconds: 8 }).line,
    })),
  };
}

export const getVideoWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { browser?: BrowserProbe | null }) =>
    z.object({ browser: z.any().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertAdmin(supabase);
    return snapshot(supabase, (data.browser ?? null) as BrowserProbe | null);
  });

const REGISTER = z.object({
  mode: z.enum(["LOCAL", "FREE_CLOUD", "PAID_CLOUD"]),
  label: z.string().trim().min(2).max(80),
  endpointUrl: z.string().trim().url().max(300).nullable().optional(),
  provider: z.string().trim().max(80).nullable().optional(),
});

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Registers a worker and returns its access token exactly once. Only the hash
 * is stored, so a lost token can be replaced but never recovered.
 */
export const registerVideoWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof REGISTER>) => REGISTER.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    const { data: row, error } = await supabase
      .from("marketing_video_workers")
      .insert({
        mode: data.mode,
        label: data.label,
        endpoint_url: data.endpointUrl ?? null,
        provider: data.provider ?? null,
        token_hash: await hashToken(token),
        status: "OFFLINE",
        status_detail: "Waiting for the worker to connect.",
        enabled: data.mode !== "PAID_CLOUD",
      })
      .select("id")
      .single();
    if (error) throw new Error("That worker could not be added. Check the name is not already used.");

    await supabase.from("marketing_audit").insert({
      action: "video_worker_registered",
      actor: "human",
      actor_id: userId,
      detail: `${WORKER_LABEL[data.mode]} "${data.label}" registered.`,
    });

    return {
      workerId: row.id as string,
      token,
      note: "Copy this access token now — it is shown once and cannot be retrieved again.",
    };
  });

export const removeVideoWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workerId: string }) =>
    z.object({ workerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);
    await supabase.from("marketing_video_workers").delete().eq("id", data.workerId);
    await supabase.from("marketing_audit").insert({
      action: "video_worker_removed",
      actor: "human",
      actor_id: userId,
      detail: `Video worker ${data.workerId} removed.`,
    });
    return { ok: true };
  });

export const setVideoWorkerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workerId: string; enabled: boolean }) =>
    z.object({ workerId: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);
    await supabase
      .from("marketing_video_workers")
      .update({ enabled: data.enabled })
      .eq("id", data.workerId);
    await supabase.from("marketing_audit").insert({
      action: data.enabled ? "video_worker_enabled" : "video_worker_disabled",
      actor: "human",
      actor_id: userId,
      detail: `Video worker ${data.workerId} ${data.enabled ? "switched on" : "switched off"}.`,
    });
    return { ok: true };
  });

const PREFERENCES = z.object({
  defaultWorker: z.enum(["AUTO", "BROWSER", "LOCAL", "FREE_CLOUD", "PAID_CLOUD"]).optional(),
  paidComputeEnabled: z.boolean().optional(),
  autonomousGeneration: z.boolean().optional(),
  autonomousPublishing: z.boolean().optional(),
  generationPaused: z.boolean().optional(),
  publishingPaused: z.boolean().optional(),
  usage: z
    .object({
      maxVideosPerDay: z.number().optional(),
      maxVariantsPerCampaign: z.number().optional(),
      maxRegenerationsPerAsset: z.number().optional(),
    })
    .optional(),
  spend: z
    .object({
      perVideoPence: z.number().optional(),
      perDayPence: z.number().optional(),
      perCampaignPence: z.number().optional(),
      perMonthPence: z.number().optional(),
    })
    .optional(),
});

export const updateVideoWorkerPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof PREFERENCES>) => PREFERENCES.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);
    const settings = await loadSettings(supabase);
    const next = applyWorkerPreferences(readWorkerPreferences(settings), data as never);
    await supabase
      .from("marketing_settings")
      .upsert({ id: true, settings: { ...settings, videoWorker: next } });
    await supabase.from("marketing_audit").insert({
      action: "video_worker_settings_updated",
      actor: "human",
      actor_id: userId,
      detail: `Video worker settings updated: default ${next.defaultWorker}, paid compute ${next.paidComputeEnabled ? "on" : "off"}.`,
    });
    return next;
  });
