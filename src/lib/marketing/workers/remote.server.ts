/**
 * Generic remote video worker client — server only.
 *
 * One HTTP contract serves every worker that is not this browser: the
 * founder's own machine and any free or paid cloud worker registered in the
 * worker registry. It is the same protocol the existing self-hosted worker
 * already speaks (`POST /jobs`, `GET /jobs/:id`, `GET /jobs/:id/output`,
 * `POST /jobs/:id/cancel`), so no second worker protocol is introduced.
 *
 * The client is provider-neutral: the address comes from the registry row and
 * the outbound credential from a server-side secret. Nothing here invents a
 * video, and no route ever falls back to a different worker on its own.
 */
import type { BrandOverlaySpec } from "../branding";
import type { VideoJobState } from "../video-queue";
import type { WorkerMode } from "./types";

export type RemoteWorkerEndpoint = {
  mode: WorkerMode;
  /** Registry row id of the worker that will actually run the job. */
  workerId: string | null;
  label: string;
  url: string;
  token: string;
  provider: string | null;
};

export type RemoteEndpointResolution =
  | { ok: true; endpoint: RemoteWorkerEndpoint }
  | { ok: false; status: "NOT_CONFIGURED" | "AUTH_REQUIRED"; reason: string };

/** Secret holding the outbound credential for each remote worker mode. */
const TOKEN_SECRET: Record<string, string> = {
  LOCAL: "VIDEO_WORKER_TOKEN",
  FREE_CLOUD: "FREE_CLOUD_WORKER_TOKEN",
  PAID_CLOUD: "PAID_CLOUD_WORKER_TOKEN",
};

/**
 * Turns a registry row into a callable endpoint, or explains exactly what is
 * missing. Never guesses an address and never sends an empty credential.
 */
export function resolveRemoteEndpoint(
  worker: { mode: WorkerMode; id: string | null; label: string; endpointUrl: string | null; provider: string | null },
  env: Record<string, string | undefined>,
): RemoteEndpointResolution {
  if (worker.mode === "BROWSER") {
    return {
      ok: false,
      status: "NOT_CONFIGURED",
      reason: "This browser does not have a remote address.",
    };
  }
  if (!worker.endpointUrl) {
    return {
      ok: false,
      status: "NOT_CONFIGURED",
      reason:
        worker.mode === "FREE_CLOUD"
          ? "Free cloud worker not configured."
          : `${worker.label} has no address set, so no job can be sent to it.`,
    };
  }
  const secret = TOKEN_SECRET[worker.mode]!;
  const token = env[secret];
  if (!token) {
    return {
      ok: false,
      status: "AUTH_REQUIRED",
      reason: `${worker.label} needs to reconnect: its access token has not been set up.`,
    };
  }
  return {
    ok: true,
    endpoint: {
      mode: worker.mode,
      workerId: worker.id,
      label: worker.label,
      url: worker.endpointUrl.replace(/\/+$/, ""),
      token,
      provider: worker.provider,
    },
  };
}

function headers(endpoint: RemoteWorkerEndpoint): Record<string, string> {
  return {
    Authorization: `Bearer ${endpoint.token}`,
    "Content-Type": "application/json",
  };
}

/** The job specification a worker receives. Carries the campaign's intelligence. */
export type RemoteJobRequest = {
  jobId: string;
  campaignId: string;
  assetId: string;
  platform: string;
  prompt: string;
  story: string;
  aspect: "9:16" | "16:9" | "1:1";
  seconds: number;
  resolution: string;
  fps: number;
  seed: number;
  model: string | null;
  voice: boolean;
  music: boolean;
  overlay: BrandOverlaySpec;
};

export type RemoteCreate =
  | { ok: true; jobId: string; state: VideoJobState; model: string | null }
  | { ok: false; status: "WORKER_UNAVAILABLE" | "AUTH_REQUIRED" | "GENERATION_FAILED"; reason: string };

export async function createRemoteJob(
  endpoint: RemoteWorkerEndpoint,
  request: RemoteJobRequest,
  fetchImpl?: typeof fetch,
): Promise<RemoteCreate> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${endpoint.url}/jobs`, {
      method: "POST",
      headers: headers(endpoint),
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "AUTH_REQUIRED",
        reason: `${endpoint.label} needs to reconnect: it rejected EarnRoom's access token.`,
      };
    }
    if (response.status === 402 || response.status === 429) {
      return {
        ok: false,
        status: "WORKER_UNAVAILABLE",
        reason:
          typeof body["message"] === "string"
            ? body["message"]
            : `${endpoint.label} has no free capacity available right now.`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: "GENERATION_FAILED",
        reason:
          typeof body["message"] === "string"
            ? body["message"]
            : `${endpoint.label} refused the job (HTTP ${response.status}).`,
      };
    }
    const jobId = typeof body["jobId"] === "string" ? body["jobId"] : null;
    if (!jobId) {
      return {
        ok: false,
        status: "GENERATION_FAILED",
        reason: `${endpoint.label} returned no job identifier.`,
      };
    }
    return {
      ok: true,
      jobId,
      state: (typeof body["state"] === "string" ? body["state"] : "QUEUED") as VideoJobState,
      model: typeof body["model"] === "string" ? body["model"] : (request.model ?? null),
    };
  } catch (error) {
    return {
      ok: false,
      status: "WORKER_UNAVAILABLE",
      reason:
        error instanceof Error
          ? `${endpoint.label} could not be reached: ${error.message}`
          : `${endpoint.label} could not be reached.`,
    };
  }
}

export type RemotePoll =
  | { ok: true; done: false; state: VideoJobState; progress: number }
  | { ok: true; done: true; bytes: ArrayBuffer; contentType: string; confirmedCostPence: number | null }
  | { ok: false; reason: string };

export async function pollRemoteJob(
  endpoint: RemoteWorkerEndpoint,
  jobId: string,
  fetchImpl?: typeof fetch,
): Promise<RemotePoll> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${endpoint.url}/jobs/${jobId}`, { headers: headers(endpoint) });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        reason:
          typeof body["message"] === "string"
            ? body["message"]
            : `${endpoint.label} could not report on the job (HTTP ${response.status}).`,
      };
    }
    const state = (typeof body["state"] === "string" ? body["state"] : "GENERATING") as VideoJobState;
    if (state === "FAILED" || state === "CANCELLED") {
      return {
        ok: false,
        reason:
          typeof body["reason"] === "string"
            ? body["reason"]
            : state === "CANCELLED"
              ? "The generation was cancelled."
              : `Video generation failed on ${endpoint.label}.`,
      };
    }
    if (state !== "READY") {
      return {
        ok: true,
        done: false,
        state,
        progress: typeof body["progress"] === "number" ? body["progress"] : 0,
      };
    }
    const output = await doFetch(`${endpoint.url}/jobs/${jobId}/output`, {
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    if (!output.ok) {
      return {
        ok: false,
        reason: `The finished video could not be downloaded from ${endpoint.label} (HTTP ${output.status}).`,
      };
    }
    // A cost is only recorded when the provider itself reports one.
    const reported = body["costPence"];
    return {
      ok: true,
      done: true,
      bytes: await output.arrayBuffer(),
      contentType: output.headers.get("content-type") ?? "video/mp4",
      confirmedCostPence: typeof reported === "number" && Number.isFinite(reported) ? reported : null,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `${endpoint.label} could not be reached: ${error.message}`
          : `${endpoint.label} could not be reached.`,
    };
  }
}

export async function cancelRemoteJob(
  endpoint: RemoteWorkerEndpoint,
  jobId: string,
  fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${endpoint.url}/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: headers(endpoint),
    });
    return response.ok
      ? { ok: true, detail: `Generation cancelled on ${endpoint.label}.` }
      : {
          ok: false,
          detail: `${endpoint.label} could not cancel the job (HTTP ${response.status}). It may still finish on the worker.`,
        };
  } catch {
    return {
      ok: false,
      detail: `${endpoint.label} could not be reached, so the cancellation could not be passed on. It may still finish on the worker.`,
    };
  }
}
