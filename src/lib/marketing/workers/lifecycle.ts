/**
 * Video job lifecycle.
 *
 * Extends the existing queue states (`video-queue.ts`) with the finer phases a
 * full worker pipeline moves through. The queue module still owns admission
 * control; this module owns what the founder is told and which move is legal.
 *
 * "Published" is a platform-confirmed fact, never an optimistic label.
 */
import type { VideoJobState } from "../video-queue";

export type JobPhase =
  | "CREATED"
  | "QUEUED"
  | "WORKER_SELECTED"
  | "VALIDATING"
  | "GENERATING_VIDEO"
  | "GENERATING_VOICE"
  | "GENERATING_AUDIO"
  | "COMPOSING"
  | "RENDERING"
  | "VALIDATING_OUTPUT"
  | "UPLOADING_TO_EARNROOM"
  | "READY_FOR_PREVIEW"
  | "APPROVAL_REQUIRED"
  | "APPROVED"
  | "QUEUED_FOR_PUBLISHING"
  | "UPLOADING_TO_PLATFORM"
  | "PUBLISHED"
  | JobFailure;

export type JobFailure =
  | "VALIDATION_FAILED"
  | "WORKER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "GENERATION_FAILED"
  | "VOICE_FAILED"
  | "AUDIO_FAILED"
  | "COMPOSITION_FAILED"
  | "UPLOAD_FAILED"
  | "PLATFORM_REJECTED"
  | "PAUSED"
  | "CANCELLED";

export const JOB_FAILURES: readonly JobFailure[] = [
  "VALIDATION_FAILED",
  "WORKER_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "AUTH_REQUIRED",
  "GENERATION_FAILED",
  "VOICE_FAILED",
  "AUDIO_FAILED",
  "COMPOSITION_FAILED",
  "UPLOAD_FAILED",
  "PLATFORM_REJECTED",
  "PAUSED",
  "CANCELLED",
];

export function isFailurePhase(phase: JobPhase): phase is JobFailure {
  return (JOB_FAILURES as readonly string[]).includes(phase);
}

/** The generation half of the pipeline, in order. */
export const GENERATION_PHASES: readonly JobPhase[] = [
  "CREATED",
  "QUEUED",
  "WORKER_SELECTED",
  "VALIDATING",
  "GENERATING_VIDEO",
  "GENERATING_VOICE",
  "GENERATING_AUDIO",
  "COMPOSING",
  "RENDERING",
  "VALIDATING_OUTPUT",
  "UPLOADING_TO_EARNROOM",
  "READY_FOR_PREVIEW",
];

/** The publishing half, which only begins after a founder decision. */
export const PUBLISHING_PHASES: readonly JobPhase[] = [
  "READY_FOR_PREVIEW",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "QUEUED_FOR_PUBLISHING",
  "UPLOADING_TO_PLATFORM",
  "PUBLISHED",
];

function successorsOf(phase: JobPhase): JobPhase[] {
  const generationIndex = GENERATION_PHASES.indexOf(phase);
  if (generationIndex >= 0 && generationIndex < GENERATION_PHASES.length - 1) {
    return [GENERATION_PHASES[generationIndex + 1]!];
  }
  const publishingIndex = PUBLISHING_PHASES.indexOf(phase);
  if (publishingIndex >= 0 && publishingIndex < PUBLISHING_PHASES.length - 1) {
    return [PUBLISHING_PHASES[publishingIndex + 1]!];
  }
  return [];
}

/**
 * Legal moves. Any live phase may fail, pause or be cancelled; a failed or
 * cancelled job may only be retried from the beginning as a new attempt.
 */
export function mayMoveTo(from: JobPhase, to: JobPhase): boolean {
  if (from === to) return false;
  if (from === "PUBLISHED") return false;
  if (isFailurePhase(from)) return to === "QUEUED";
  if (isFailurePhase(to)) return true;
  // Skipping voice or audio is legal when the campaign asked for neither.
  const forward = successorsOf(from);
  if (forward.includes(to)) return true;
  const fromIndex = GENERATION_PHASES.indexOf(from);
  const toIndex = GENERATION_PHASES.indexOf(to);
  if (fromIndex >= 0 && toIndex > fromIndex) return true;
  const fromPublish = PUBLISHING_PHASES.indexOf(from);
  const toPublish = PUBLISHING_PHASES.indexOf(to);
  return fromPublish >= 0 && toPublish === fromPublish + 1;
}

const PHASE_LABEL: Record<string, string> = {
  CREATED: "Preparing",
  QUEUED: "Waiting for a worker",
  WORKER_SELECTED: "Worker chosen",
  VALIDATING: "Checking the campaign",
  GENERATING_VIDEO: "Generating scenes…",
  GENERATING_VOICE: "Generating voice…",
  GENERATING_AUDIO: "Generating music…",
  COMPOSING: "Composing…",
  RENDERING: "Rendering…",
  VALIDATING_OUTPUT: "Validating…",
  UPLOADING_TO_EARNROOM: "Uploading…",
  READY_FOR_PREVIEW: "Ready to review",
  APPROVAL_REQUIRED: "Waiting for your approval",
  APPROVED: "Approved",
  QUEUED_FOR_PUBLISHING: "Waiting to be published",
  UPLOADING_TO_PLATFORM: "Sending to the platform…",
  PUBLISHED: "Published",
  VALIDATION_FAILED: "The campaign did not pass its checks",
  WORKER_UNAVAILABLE: "The chosen worker was not available",
  MODEL_UNAVAILABLE: "The required model is not available on that worker",
  AUTH_REQUIRED: "The worker could not be authenticated",
  GENERATION_FAILED: "The scenes could not be generated",
  VOICE_FAILED: "The voiceover could not be generated",
  AUDIO_FAILED: "The music could not be prepared",
  COMPOSITION_FAILED: "The video could not be put together",
  UPLOAD_FAILED: "The finished video could not be saved",
  PLATFORM_REJECTED: "The platform refused the video",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export function phaseLabel(phase: JobPhase): string {
  return PHASE_LABEL[phase] ?? "Working…";
}

/** Maps a fine-grained phase onto the existing coarse queue state. */
export function queueStateFor(phase: JobPhase): VideoJobState {
  if (phase === "CANCELLED") return "CANCELLED";
  if (isFailurePhase(phase)) return "FAILED";
  if (["CREATED", "QUEUED", "WORKER_SELECTED"].includes(phase)) return "QUEUED";
  if (["VALIDATING", "VALIDATING_OUTPUT"].includes(phase)) return "VALIDATING";
  if (["COMPOSING", "RENDERING", "UPLOADING_TO_EARNROOM"].includes(phase)) return "RENDERING";
  if (GENERATION_PHASES.includes(phase)) return "GENERATING";
  return "READY";
}

/** Founder-facing failure copy: a plain reason plus the next thing to try. */
export function failureGuidance(phase: JobFailure): { reason: string; actions: string[] } {
  const actions: Record<JobFailure, string[]> = {
    VALIDATION_FAILED: ["Fix and regenerate"],
    WORKER_UNAVAILABLE: ["Choose another worker", "Retry"],
    MODEL_UNAVAILABLE: ["Choose another worker", "Install the model on that worker"],
    AUTH_REQUIRED: ["Reconnect the worker"],
    GENERATION_FAILED: ["Retry", "Choose another worker"],
    VOICE_FAILED: ["Retry without a voiceover", "Choose another worker"],
    AUDIO_FAILED: ["Retry without music"],
    COMPOSITION_FAILED: ["Retry"],
    UPLOAD_FAILED: ["Retry"],
    PLATFORM_REJECTED: ["View technical details"],
    PAUSED: ["Resume"],
    CANCELLED: ["Generate again"],
  };
  return { reason: phaseLabel(phase), actions: actions[phase] };
}
