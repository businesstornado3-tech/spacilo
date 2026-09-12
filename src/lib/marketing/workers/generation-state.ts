/**
 * Generation attempt state, one per mode.
 *
 * The founder console can only ever show the truth about the mode that is
 * actually selected. A Computer failure ("no address set") is a fact about the
 * Computer route and must never appear while Browser is running, and a Browser
 * failure must never appear under Paid Cloud.
 *
 * So there is no shared error string anywhere: every attempt is stored against
 * its own mode, campaign, asset and attempt id, and the panel reads only the
 * attempt belonging to the selected mode.
 *
 * Pure module: no clock, no network, no React.
 */
import type { WorkerMode } from "./types";

export type GenerationMode = WorkerMode;

export type GenerationStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export type GenerationAttempt = {
  campaignId: string;
  assetId: string;
  mode: GenerationMode;
  attemptId: string;
  /** The server-side job, where the route has one. Browser renders locally. */
  jobId: string | null;
  status: GenerationStatus;
  /** Plain-English stage, shown while the attempt is running. */
  stage: string | null;
  /** 0..1 for the local renderer; 0 for routes that report no progress. */
  progress: number;
  /** Machine-readable reason, kept for diagnostics. */
  errorCode: string | null;
  /** Founder-readable message. Never shown under another mode. */
  message: string | null;
};

/** Every mode keeps its own latest attempt. Nothing is shared between them. */
export type GenerationState = Partial<Record<GenerationMode, GenerationAttempt>>;

export const EMPTY_GENERATION_STATE: GenerationState = {};

/** What the console says while a mode is selected, before anything is run. */
export function modeStatusLine(mode: GenerationMode): string {
  switch (mode) {
    case "BROWSER":
      return "Using Browser Local. Running on Browser Local. No third-party generation fee.";
    case "LOCAL":
      return "Using My computer.";
    case "FREE_CLOUD":
      return "Using Free Cloud.";
    default:
      return "Using Paid Cloud.";
  }
}

export function startAttempt(
  state: GenerationState,
  input: {
    campaignId: string;
    assetId: string;
    mode: GenerationMode;
    attemptId: string;
    jobId?: string | null;
    stage?: string | null;
  },
): GenerationState {
  return {
    ...state,
    [input.mode]: {
      campaignId: input.campaignId,
      assetId: input.assetId,
      mode: input.mode,
      attemptId: input.attemptId,
      jobId: input.jobId ?? null,
      status: "RUNNING",
      stage: input.stage ?? null,
      progress: 0,
      errorCode: null,
      message: null,
    },
  };
}

/**
 * Updates one attempt. A late reply from a superseded attempt is ignored, so a
 * stale Computer result can never overwrite the attempt on screen.
 */
export function updateAttempt(
  state: GenerationState,
  mode: GenerationMode,
  attemptId: string,
  patch: Partial<Omit<GenerationAttempt, "campaignId" | "assetId" | "mode" | "attemptId">>,
): GenerationState {
  const current = state[mode];
  if (!current || current.attemptId !== attemptId) return state;
  return { ...state, [mode]: { ...current, ...patch } };
}

export function failAttempt(
  state: GenerationState,
  mode: GenerationMode,
  attemptId: string,
  input: { message: string; errorCode?: string | null },
): GenerationState {
  return updateAttempt(state, mode, attemptId, {
    status: "FAILED",
    stage: null,
    progress: 0,
    errorCode: input.errorCode ?? null,
    message: input.message,
  });
}

export function succeedAttempt(
  state: GenerationState,
  mode: GenerationMode,
  attemptId: string,
  message: string,
): GenerationState {
  return updateAttempt(state, mode, attemptId, {
    status: "SUCCEEDED",
    stage: null,
    progress: 1,
    errorCode: null,
    message,
  });
}

/** Forgets one mode's attempt. History and audit records are unaffected. */
export function clearMode(state: GenerationState, mode: GenerationMode): GenerationState {
  if (!state[mode]) return state;
  const next = { ...state };
  delete next[mode];
  return next;
}

/**
 * The only attempt the active panel may read: the selected mode's own, and only
 * when it belongs to the campaign and asset on screen.
 */
export function activeAttempt(
  state: GenerationState,
  mode: GenerationMode | null,
  scope?: { campaignId: string; assetId?: string | null },
): GenerationAttempt | null {
  if (!mode) return null;
  const attempt = state[mode];
  if (!attempt) return null;
  if (scope && attempt.campaignId !== scope.campaignId) return null;
  if (scope?.assetId && attempt.assetId !== scope.assetId) return null;
  return attempt;
}

/** The message the active panel shows. Null when this mode has nothing to say. */
export function activeMessage(
  state: GenerationState,
  mode: GenerationMode | null,
  scope?: { campaignId: string; assetId?: string | null },
): string | null {
  return activeAttempt(state, mode, scope)?.message ?? null;
}

export function isRunning(
  state: GenerationState,
  mode: GenerationMode | null,
  scope?: { campaignId: string; assetId?: string | null },
): boolean {
  return activeAttempt(state, mode, scope)?.status === "RUNNING";
}
