/* eslint-disable @typescript-eslint/no-explicit-any --
 * The marketing worker table was added after the generated Supabase types were
 * last produced, so the query builder is untyped here. Every row is narrowed
 * into the typed shapes exported from `@/lib/marketing/workers`.
 */
/**
 * The one place worker rows become worker descriptors — server only.
 *
 * Both the worker registry screen and the generation pipeline read the same
 * list through this module, so what the founder sees in Video Workers is
 * exactly what "Generate video" will resolve against. There is no second
 * registry.
 */
import { browserCapability, type BrowserProbe } from "./browser-capability";
import { normaliseHardware } from "./hardware";
import { WORKER_LABEL } from "./types";
import type {
  CapabilityClass,
  WorkerDescriptor,
  WorkerMode,
  WorkerRuntimeStatus,
} from "./types";

/** A worker is treated as offline once its heartbeat goes quiet. */
export const HEARTBEAT_TIMEOUT_MS = 90_000;

export function rowToDescriptor(row: any): WorkerDescriptor {
  const hardware =
    row.hardware && Object.keys(row.hardware).length > 0 ? normaliseHardware(row.hardware) : null;
  return {
    mode: row.mode as WorkerMode,
    id: row.id as string,
    label: row.label as string,
    status: row.status as WorkerRuntimeStatus,
    detail: row.status_detail as string,
    capability: (hardware?.capability ?? (row.capability as CapabilityClass)) as CapabilityClass,
    hardware,
    provider: row.provider ?? null,
    installedModels: (row.installed_models ?? []) as string[],
    enabled: row.enabled === true,
    chargeable: row.mode === "PAID_CLOUD",
    queued: Number(row.queued ?? 0),
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
  };
}

export function withHeartbeatTimeout(worker: WorkerDescriptor, now: number): WorkerDescriptor {
  if (worker.mode === "BROWSER") return worker;
  const beat = worker.lastHeartbeatAt ? Date.parse(worker.lastHeartbeatAt) : NaN;
  if (Number.isNaN(beat) || now - beat <= HEARTBEAT_TIMEOUT_MS) return worker;
  return { ...worker, status: "OFFLINE", detail: "No signal from this worker recently." };
}

/**
 * The browser worker is not a database row: it is whatever machine the founder
 * is sitting at, described only from what the page could actually see.
 */
export function browserDescriptor(browser: BrowserProbe | null): WorkerDescriptor {
  const capability = browser ? browserCapability(browser) : null;
  return {
    mode: "BROWSER",
    id: null,
    label: WORKER_LABEL.BROWSER,
    status:
      capability === null ? "OFFLINE" : capability.status === "UNSUPPORTED" ? "ERROR" : "IDLE",
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
}

export type WorkerEndpointRow = {
  id: string;
  mode: WorkerMode;
  label: string;
  endpointUrl: string | null;
  provider: string | null;
};

export type WorkerRegistrySnapshot = {
  workers: WorkerDescriptor[];
  /** Addresses, keyed by registry row id. Tokens are never read from here. */
  endpoints: Map<string, WorkerEndpointRow>;
};

/** Loads every worker the orchestrator may consider, browser included. */
export async function loadWorkers(
  supabase: any,
  browser: BrowserProbe | null,
  now = Date.now(),
): Promise<WorkerRegistrySnapshot> {
  const { data } = await supabase
    .from("marketing_video_workers")
    .select("*")
    .order("mode", { ascending: true });

  const rows = ((data ?? []) as any[]).filter((row) => row.mode !== "BROWSER");
  const endpoints = new Map<string, WorkerEndpointRow>();
  for (const row of rows) {
    endpoints.set(row.id as string, {
      id: row.id as string,
      mode: row.mode as WorkerMode,
      label: row.label as string,
      endpointUrl: row.endpoint_url ?? null,
      provider: row.provider ?? null,
    });
  }

  return {
    workers: [
      browserDescriptor(browser),
      ...rows.map((row) => withHeartbeatTimeout(rowToDescriptor(row), now)),
    ],
    endpoints,
  };
}
