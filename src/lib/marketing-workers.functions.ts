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
  costReport,
  WORKER_LABEL,
  readWorkerPreferences,
  selectWorker,
  type BrowserProbe,
  type WorkerDescriptor,
  type WorkerMode,
  type WorkerPreferences,
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

export type VideoWorkerSnapshot = {
  workers: WorkerDescriptor[];
  preferences: WorkerPreferences;
  /** Plain-English note for the founder about the current route. */
  routeSummary: string;
  costLines: { mode: WorkerMode; label: string; line: string }[];
  /** True when the hosted video provider is configured server-side. */
  paidProviderConfigured: boolean;
  /** True only when a real Windows worker installer can be downloaded. */
  installerAvailable: boolean;
};

async function snapshot(supabase: any, browser: BrowserProbe | null): Promise<VideoWorkerSnapshot> {
  const settings = await loadSettings(supabase);
  const preferences = readWorkerPreferences(settings);
  const [{ loadWorkers }, hosted, provider] = await Promise.all([
    import("@/lib/marketing/workers/registry.server"),
    import("@/lib/marketing/workers/hosted"),
    import("@/lib/marketing/video.server"),
  ]);
  const loaded = await loadWorkers(supabase, browser);
  // Reading configuration is a local check — it never calls the provider.
  const configuration = provider.videoProviderConfiguration();
  const paidProviderConfigured = configuration.state === "CONFIGURED";
  const workers = hosted.withHostedPaidCloud(loaded.workers, {
    providerConfigured: paidProviderConfigured,
    provider: configuration.name,
  });

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
    paidProviderConfigured,
    installerAvailable: installerPublished(),
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
    if (error)
      throw new Error("That worker could not be added. Check the name is not already used.");

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

/* ------------------------------------------------------------- pairing */

/**
 * Pairing lets the founder connect a computer without ever handling a secret.
 * The console shows a short code; the worker on the machine exchanges that
 * code for its own access token, which EarnRoom stores only as a hash and
 * never shows on screen.
 */
const PAIRING_MINUTES = 30;

function pairingCode(): string {
  // Unambiguous characters only, so the code can be read aloud or typed.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export type WorkerPairing = {
  code: string;
  label: string;
  expiresAt: string;
  claimedAt: string | null;
};

export const getWorkerPairings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ pairings: WorkerPairing[] }> => {
    const { supabase } = context;
    await assertAdmin(supabase);
    const { data } = await supabase
      .from("marketing_video_worker_pairings")
      .select("code, label, expires_at, claimed_at")
      .gt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    return {
      pairings: ((data ?? []) as any[]).map((row) => ({
        code: row.code,
        label: row.label,
        expiresAt: row.expires_at,
        claimedAt: row.claimed_at,
      })),
    };
  });

export const createWorkerPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string; mode?: "LOCAL" | "FREE_CLOUD" }) =>
    z
      .object({
        label: z.string().trim().min(2).max(80).default("My computer"),
        mode: z.enum(["LOCAL", "FREE_CLOUD"]).default("LOCAL"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<WorkerPairing> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);
    const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000).toISOString();
    const code = pairingCode();

    const { error } = await supabase.from("marketing_video_worker_pairings").insert({
      code,
      label: data.label,
      mode: data.mode,
      created_by: userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error("That setup code could not be created. Try again.");

    await supabase.from("marketing_audit").insert({
      action: "video_worker_pairing_created",
      actor: "human",
      actor_id: userId,
      detail: `Setup code created for "${data.label}".`,
    });

    return { code, label: data.label, expiresAt, claimedAt: null };
  });

/* ------------------------------------------- one-click computer setup */

/**
 * The founder presses one button. EarnRoom opens a short-lived setup session
 * and hands back the address of the genuine Windows installer, named after
 * that session so the installer can pair itself. No code is displayed, no
 * token is ever shown, and the session dies in 30 minutes or on first use.
 */
export type ComputerSetupSession = {
  /** Where the browser should fetch the real installer from. */
  downloadPath: string;
  /**
   * Where to fetch the tiny pairing file for a computer that already has the
   * worker installed. No installer download is involved.
   */
  pairingPath: string;
  expiresAt: string;
  /** False when no genuine installer has been published yet. */
  installerAvailable: boolean;
  /** Opaque handle the console polls with. Not a credential on its own. */
  handle: string;
};

function installerPublished(): boolean {
  return Boolean(process.env["EARNROOM_WORKER_INSTALLER_URL"]);
}

export const beginComputerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string }) =>
    z.object({ label: z.string().trim().min(2).max(80).default("My computer") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ComputerSetupSession> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);

    const { installerFileName, pairingFileName } = await import(
      "@/lib/marketing/workers/setup"
    );
    const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000).toISOString();
    const code = pairingCode();

    const { error } = await supabase.from("marketing_video_worker_pairings").insert({
      code,
      label: data.label,
      mode: "LOCAL",
      created_by: userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error("Setup could not be started. Try again.");

    await supabase.from("marketing_audit").insert({
      action: "video_worker_setup_started",
      actor: "human",
      actor_id: userId,
      detail: `Computer setup started for "${data.label}".`,
    });

    return {
      downloadPath: `/api/public/video-worker/setup/${installerFileName(code)}`,
      pairingPath: `/api/public/video-worker/setup/${pairingFileName(code)}`,
      expiresAt,
      installerAvailable: installerPublished(),
      handle: code,
    };
  });

export type ComputerSetupStatus = {
  claimed: boolean;
  expired: boolean;
  installerAvailable: boolean;
  heartbeatAt: string | null;
  worker: WorkerDescriptor | null;
};

export const getComputerSetupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { handle: string }) =>
    z.object({ handle: z.string().trim().min(6).max(16) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ComputerSetupStatus> => {
    const { supabase } = context;
    await assertAdmin(supabase);

    const { data: row } = await supabase
      .from("marketing_video_worker_pairings")
      .select("claimed_at, expires_at, worker_id")
      .eq("code", data.handle.toUpperCase())
      .maybeSingle();

    if (!row) {
      return {
        claimed: false,
        expired: true,
        installerAvailable: installerPublished(),
        heartbeatAt: null,
        worker: null,
      };
    }

    let worker: WorkerDescriptor | null = null;
    if (row.worker_id) {
      const { loadWorkers } = await import("@/lib/marketing/workers/registry.server");
      const { workers } = await loadWorkers(supabase, null);
      worker = workers.find((entry) => entry.id === row.worker_id) ?? null;
    }

    return {
      claimed: Boolean(row.claimed_at),
      expired: !row.claimed_at && Date.parse(row.expires_at) < Date.now(),
      installerAvailable: installerPublished(),
      heartbeatAt: worker?.lastHeartbeatAt ?? null,
      worker,
    };
  });
