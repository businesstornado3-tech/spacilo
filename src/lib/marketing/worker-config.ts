/**
 * Self-hosted video worker configuration.
 *
 * These are internal operational settings, never public settings: the worker
 * URL and its shared token are read server-side only and are never returned to
 * the browser. What the founder console sees is a status and a model name.
 *
 * Pure module: the caller supplies the environment it read.
 */
import { SELECTED_VIDEO_MODEL_ID, selectedVideoModel, videoModel } from "./video-model";

export type WorkerStatus =
  | "AVAILABLE"
  | "BUSY"
  | "OFFLINE"
  | "MODEL_LOADING"
  | "AUTH_FAILED"
  | "ERROR";

export type WorkerLimits = {
  maxConcurrentJobs: number;
  maxJobsPerDay: number;
  maxVideoSeconds: number;
  maxQueueLength: number;
  allowedResolutions: readonly string[];
};

export type WorkerConfig = {
  /** Present only when the worker endpoint and its token are both configured. */
  configured: boolean;
  url: string | null;
  hasToken: boolean;
  modelId: string;
  modelName: string;
  modelVersion: string;
  gpuCapacity: number;
  defaultResolution: string;
  defaultFps: number;
  limits: WorkerLimits;
  /**
   * Pence per GPU-minute where the founder has told us what their compute
   * actually costs. Null means "unknown" — never guessed, never shown as a fee.
   */
  infrastructurePencePerGpuMinute: number | null;
};

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Builds the worker configuration from environment values.
 *
 * `VIDEO_WORKER_URL` and `VIDEO_WORKER_TOKEN` must both be present: an
 * unauthenticated worker endpoint is treated as not configured.
 */
export function workerConfig(env: Record<string, string | undefined>): WorkerConfig {
  const url = env["VIDEO_WORKER_URL"]?.trim() || null;
  const hasToken = Boolean(env["VIDEO_WORKER_TOKEN"]?.trim());
  const requestedModel = env["VIDEO_WORKER_MODEL"]?.trim() || SELECTED_VIDEO_MODEL_ID;
  const model = videoModel(requestedModel) ?? selectedVideoModel();
  const infra = Number(env["VIDEO_WORKER_INFRA_PENCE_PER_GPU_MINUTE"]);

  return {
    configured: Boolean(url) && hasToken,
    url,
    hasToken,
    modelId: model.id,
    modelName: model.name,
    modelVersion: env["VIDEO_WORKER_MODEL_VERSION"]?.trim() || model.version,
    gpuCapacity: num(env["VIDEO_WORKER_GPU_CAPACITY"], 1),
    defaultResolution: env["VIDEO_WORKER_DEFAULT_RESOLUTION"]?.trim() || "720p",
    defaultFps: num(env["VIDEO_WORKER_DEFAULT_FPS"], 24),
    limits: {
      maxConcurrentJobs: num(env["VIDEO_WORKER_MAX_CONCURRENT_JOBS"], 1),
      maxJobsPerDay: num(env["VIDEO_WORKER_MAX_JOBS_PER_DAY"], 24),
      maxVideoSeconds: num(env["VIDEO_WORKER_MAX_VIDEO_SECONDS"], 10),
      maxQueueLength: num(env["VIDEO_WORKER_MAX_QUEUE_LENGTH"], 8),
      allowedResolutions: (env["VIDEO_WORKER_ALLOWED_RESOLUTIONS"]?.trim() || "360p,540p,720p")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    },
    infrastructurePencePerGpuMinute: Number.isFinite(infra) && infra >= 0 ? infra : null,
  };
}

/** Resolution and frame rate for each quality tier on the self-hosted worker. */
export function selfHostedTier(tier: "draft" | "final"): {
  resolution: string;
  fps: number;
  secondsCap: number;
} {
  return tier === "draft"
    ? { resolution: "360p", fps: 16, secondsCap: 5 }
    : { resolution: "720p", fps: 24, secondsCap: 10 };
}
