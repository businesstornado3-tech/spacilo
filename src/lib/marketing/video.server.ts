/**
 * Real AI video generation — server only.
 *
 * This talks to the configured video generation service over HTTP. There is no
 * simulated path: if no credential is configured the provider reports
 * NOT_CONFIGURED and the console says "Video generation provider requires
 * configuration". A video is only ever recorded as generated when the service
 * has returned a finished file that we have stored ourselves.
 *
 * Generation is an asynchronous job: create, poll, then download and store.
 */
import type { AspectRatio, ProviderState } from "./types";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/videos";
const PROVIDER_ID = "earnroom-video-service";
const MODEL = "google/gemini-omni-1.1-flash";

function apiKey(): string | null {
  return process.env["LOVABLE_API_KEY"] ?? null;
}

export function videoProviderConfiguration(): {
  id: string;
  name: string;
  state: ProviderState;
  detail: string;
  model: string | null;
  resolutions: readonly string[];
  aspects: readonly AspectRatio[];
} {
  const configured = Boolean(apiKey());
  return {
    id: PROVIDER_ID,
    name: "EarnRoom video service",
    state: configured ? "CONFIGURED" : "NOT_CONFIGURED",
    detail: configured
      ? "Configured server-side. A video only exists once a job completes and the file is stored."
      : "Video generation provider requires configuration.",
    model: configured ? MODEL : null,
    resolutions: ["360p", "720p"],
    aspects: ["9:16", "16:9", "1:1"],
  };
}

export type VideoJobCreate =
  | { ok: true; jobId: string; model: string }
  | { ok: false; status: "PROVIDER_NOT_CONFIGURED" | "FAILED" | "LIMIT_REACHED"; reason: string };

export type VideoJobPoll =
  | { ok: true; done: false; progress: number }
  | { ok: true; done: true; bytes: ArrayBuffer; contentType: string }
  | { ok: false; reason: string };

/** Aspect ratios the service accepts directly. 1:1 is rendered 9:16 and cropped later. */
function providerAspect(aspect: AspectRatio): "16:9" | "9:16" {
  return aspect === "16:9" ? "16:9" : "9:16";
}

export async function createVideoJob(input: {
  prompt: string;
  aspect: AspectRatio;
  seconds: number;
  resolution: "360p" | "720p";
  fetchImpl?: typeof fetch;
}): Promise<VideoJobCreate> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      status: "PROVIDER_NOT_CONFIGURED",
      reason: "Video generation provider requires configuration.",
    };
  }
  const doFetch = input.fetchImpl ?? fetch;
  const duration = `${Math.min(10, Math.max(3, Math.round(input.seconds)))}s`;

  let response: Response;
  try {
    response = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: input.prompt,
        response_format: {
          type: "video",
          resolution: input.resolution,
          duration,
          aspect_ratio: providerAspect(input.aspect),
        },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: "FAILED",
      reason: error instanceof Error ? error.message : "The video service could not be reached.",
    };
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload["message"] === "string"
        ? payload["message"]
        : `The video service refused the request (HTTP ${response.status}).`;
    if (response.status === 402 || response.status === 429) {
      return { ok: false, status: "LIMIT_REACHED", reason: message };
    }
    return { ok: false, status: "FAILED", reason: message };
  }
  const jobId = typeof payload["id"] === "string" ? payload["id"] : null;
  if (!jobId) {
    return { ok: false, status: "FAILED", reason: "The video service returned no job identifier." };
  }
  return { ok: true, jobId, model: MODEL };
}

export async function pollVideoJob(jobId: string, fetchImpl?: typeof fetch): Promise<VideoJobPoll> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "Video generation provider requires configuration." };
  const doFetch = fetchImpl ?? fetch;

  const statusResponse = await doFetch(`${ENDPOINT}/${jobId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const job = (await statusResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!statusResponse.ok) {
    const message =
      typeof job["message"] === "string"
        ? job["message"]
        : `Could not read the generation job (HTTP ${statusResponse.status}).`;
    return { ok: false, reason: message };
  }
  const status = typeof job["status"] === "string" ? job["status"] : "in_progress";
  if (status === "failed") {
    const error = job["error"];
    const reason =
      error &&
      typeof error === "object" &&
      typeof (error as Record<string, unknown>)["message"] === "string"
        ? String((error as Record<string, unknown>)["message"])
        : "The video service reported a failed generation.";
    return { ok: false, reason };
  }
  if (status !== "completed") {
    const progress = typeof job["progress"] === "number" ? job["progress"] : 0;
    return { ok: true, done: false, progress };
  }

  const contentResponse = await doFetch(`${ENDPOINT}/${jobId}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!contentResponse.ok) {
    return {
      ok: false,
      reason: `The finished video could not be downloaded (HTTP ${contentResponse.status}).`,
    };
  }
  const bytes = await contentResponse.arrayBuffer();
  if (bytes.byteLength < 1024) {
    return { ok: false, reason: "The video service returned an empty file." };
  }
  return {
    ok: true,
    done: true,
    bytes,
    contentType: contentResponse.headers.get("content-type") ?? "video/mp4",
  };
}
