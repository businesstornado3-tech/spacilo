/**
 * Self-hosted video worker client — server only.
 *
 * EarnRoom never runs model inference itself. It talks to a separate GPU worker
 * over an authenticated HTTP endpoint: submit a job, watch its state, fetch the
 * finished MP4. The worker also composites the approved EarnRoom branding, so
 * the artwork is real artwork and never something a model drew.
 *
 * There is no simulated path here. If the worker is not configured or does not
 * answer, this module says so; it never invents a video and never reaches for a
 * paid provider.
 */
import type { BrandOverlaySpec } from "./branding";
import type { VideoJobState } from "./video-queue";
import { workerConfig, type WorkerConfig, type WorkerStatus } from "./worker-config";

export function selfHostedConfig(): WorkerConfig {
  return workerConfig(process.env as Record<string, string | undefined>);
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env["VIDEO_WORKER_TOKEN"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

export type WorkerHealth = {
  status: WorkerStatus;
  detail: string;
  model: string | null;
  modelVersion: string | null;
  running: number;
  queued: number;
  capacity: number;
};

/** Live health check. Never throws: an unreachable worker is OFFLINE, not a crash. */
export async function workerHealth(fetchImpl?: typeof fetch): Promise<WorkerHealth> {
  const config = selfHostedConfig();
  const offline = (detail: string): WorkerHealth => ({
    status: "OFFLINE",
    detail,
    model: config.modelName,
    modelVersion: config.modelVersion,
    running: 0,
    queued: 0,
    capacity: config.gpuCapacity,
  });
  if (!config.configured) {
    return offline(
      "Self-hosted video generation is not configured yet. Set the worker address and its access token.",
    );
  }
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${config.url}/health`, { headers: authHeaders() });
    if (!response.ok) {
      return {
        ...offline(`The video worker answered with HTTP ${response.status}.`),
        status: response.status === 401 || response.status === 403 ? "ERROR" : "OFFLINE",
      };
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const reported = typeof body["status"] === "string" ? body["status"].toUpperCase() : "AVAILABLE";
    const status: WorkerStatus = (
      ["AVAILABLE", "BUSY", "OFFLINE", "MODEL_LOADING", "ERROR"] as const
    ).includes(reported as WorkerStatus)
      ? (reported as WorkerStatus)
      : "ERROR";
    return {
      status,
      detail:
        typeof body["detail"] === "string"
          ? body["detail"]
          : status === "AVAILABLE"
            ? "Worker online and ready."
            : `Worker reported ${status}.`,
      model: typeof body["model"] === "string" ? body["model"] : config.modelName,
      modelVersion:
        typeof body["modelVersion"] === "string" ? body["modelVersion"] : config.modelVersion,
      running: typeof body["running"] === "number" ? body["running"] : 0,
      queued: typeof body["queued"] === "number" ? body["queued"] : 0,
      capacity: typeof body["capacity"] === "number" ? body["capacity"] : config.gpuCapacity,
    };
  } catch (error) {
    return offline(
      error instanceof Error
        ? `The video worker could not be reached: ${error.message}`
        : "The video worker could not be reached.",
    );
  }
}

export type SelfHostedJobRequest = {
  prompt: string;
  aspect: "9:16" | "16:9" | "1:1";
  seconds: number;
  resolution: string;
  fps: number;
  seed: number;
  /** Approved artwork and copy the worker composites onto the footage. */
  overlay: BrandOverlaySpec;
  /** Optional first frame for image-to-video. */
  startingFrameUrl?: string | null;
  /** Reuse footage already produced for another platform in this campaign. */
  reuseJobId?: string | null;
};

export type SelfHostedCreate =
  | {
      ok: true;
      jobId: string;
      state: VideoJobState;
      model: string;
      modelVersion: string;
      seed: number;
    }
  | { ok: false; status: "SELF_HOSTED_UNAVAILABLE" | "FAILED"; reason: string };

export async function createSelfHostedJob(
  request: SelfHostedJobRequest,
  fetchImpl?: typeof fetch,
): Promise<SelfHostedCreate> {
  const config = selfHostedConfig();
  if (!config.configured) {
    return {
      ok: false,
      status: "SELF_HOSTED_UNAVAILABLE",
      reason: "Self-hosted video generation is currently unavailable.",
    };
  }
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${config.url}/jobs`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: config.modelId,
        modelVersion: config.modelVersion,
        prompt: request.prompt,
        aspect: request.aspect,
        seconds: request.seconds,
        resolution: request.resolution,
        fps: request.fps,
        seed: request.seed,
        overlay: request.overlay,
        startingFrameUrl: request.startingFrameUrl ?? null,
        reuseJobId: request.reuseJobId ?? null,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        status: "FAILED",
        reason:
          typeof body["message"] === "string"
            ? body["message"]
            : `The video worker refused the job (HTTP ${response.status}).`,
      };
    }
    const jobId = typeof body["jobId"] === "string" ? body["jobId"] : null;
    if (!jobId) {
      return { ok: false, status: "FAILED", reason: "The video worker returned no job identifier." };
    }
    const state = typeof body["state"] === "string" ? (body["state"] as VideoJobState) : "QUEUED";
    return {
      ok: true,
      jobId,
      state,
      model: config.modelId,
      modelVersion: config.modelVersion,
      seed: request.seed,
    };
  } catch (error) {
    return {
      ok: false,
      status: "SELF_HOSTED_UNAVAILABLE",
      reason:
        error instanceof Error
          ? `Self-hosted video generation is currently unavailable: ${error.message}`
          : "Self-hosted video generation is currently unavailable.",
    };
  }
}

export type SelfHostedPoll =
  | { ok: true; done: false; state: VideoJobState; progress: number }
  | { ok: true; done: true; state: "READY"; bytes: ArrayBuffer; contentType: string }
  | { ok: false; reason: string };

export async function pollSelfHostedJob(
  jobId: string,
  fetchImpl?: typeof fetch,
): Promise<SelfHostedPoll> {
  const config = selfHostedConfig();
  if (!config.configured) {
    return { ok: false, reason: "Self-hosted video generation is currently unavailable." };
  }
  const doFetch = fetchImpl ?? fetch;
  const response = await doFetch(`${config.url}/jobs/${jobId}`, { headers: authHeaders() });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      reason:
        typeof body["message"] === "string"
          ? body["message"]
          : `Could not read the generation job (HTTP ${response.status}).`,
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
            : "The video worker reported a failed generation.",
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

  const output = await doFetch(`${config.url}/jobs/${jobId}/output`, {
    headers: { Authorization: authHeaders()["Authorization"]! },
  });
  if (!output.ok) {
    return { ok: false, reason: `The finished video could not be downloaded (HTTP ${output.status}).` };
  }
  const bytes = await output.arrayBuffer();
  return {
    ok: true,
    done: true,
    state: "READY",
    bytes,
    contentType: output.headers.get("content-type") ?? "video/mp4",
  };
}

export async function cancelSelfHostedJob(
  jobId: string,
  fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; detail: string }> {
  const config = selfHostedConfig();
  if (!config.configured) {
    return { ok: false, detail: "Self-hosted video generation is currently unavailable." };
  }
  const doFetch = fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${config.url}/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    });
    return response.ok
      ? { ok: true, detail: "Generation cancelled and the GPU released." }
      : { ok: false, detail: `The worker could not cancel the job (HTTP ${response.status}).` };
  } catch {
    return { ok: false, detail: "The video worker could not be reached." };
  }
}
