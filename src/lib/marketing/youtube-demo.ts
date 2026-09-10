/**
 * Google OAuth verification demo — pure domain module.
 *
 * This describes the demonstration EarnRoom must record for Google's OAuth
 * verification review: which permissions are requested, why each one is
 * genuinely needed, and which real steps must be visible in the recording.
 *
 * Nothing here talks to Google, invents a channel, or fabricates a result.
 * It is presentation logic and safety rules only.
 */

export const YOUTUBE_DEMO_PLATFORM = "youtube" as const;

export interface DemoScope {
  scope: string;
  short: string;
  /** Plain-English description of the real, in-product use. */
  use: string;
}

/** Exactly the scopes the production OAuth definition already requests. */
export const YOUTUBE_DEMO_SCOPES: readonly DemoScope[] = [
  {
    scope: "https://www.googleapis.com/auth/youtube.upload",
    short: "youtube.upload",
    use: "Uploads an approved EarnRoom marketing video to the YouTube channel the founder authorised. Nothing is uploaded without an approved campaign asset.",
  },
  {
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    short: "youtube.readonly",
    use: "Reads the connected channel's own name and identifier so EarnRoom can confirm the destination channel before publishing, and can show the founder which channel is connected.",
  },
];

export type DemoStepId =
  | "open_app"
  | "open_connection"
  | "click_connect"
  | "google_oauth"
  | "unverified_screen"
  | "permissions"
  | "authorise"
  | "return_to_app"
  | "channel_shown"
  | "readonly_demo"
  | "select_video"
  | "real_upload"
  | "youtube_result"
  | "final_state";

export interface DemoStep {
  id: DemoStepId;
  label: string;
  detail: string;
}

/** The order the recording must show, matching Google's review guidance. */
export const YOUTUBE_DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "open_app",
    label: "Open the real EarnRoom application",
    detail: "Show earnroom.co.uk in the address bar.",
  },
  {
    id: "open_connection",
    label: "Go to the YouTube publishing connection",
    detail: "Founder console → Marketing → Publishing connections.",
  },
  {
    id: "click_connect",
    label: "Click Connect YouTube",
    detail: "EarnRoom never asks for a Google password.",
  },
  {
    id: "google_oauth",
    label: "Google sign-in appears",
    detail: "Pause the recording while typing the password or a two-factor code.",
  },
  {
    id: "unverified_screen",
    label: "Google's unverified-app screen",
    detail: "If it appears for the test account, leave it in the recording.",
  },
  {
    id: "permissions",
    label: "Requested YouTube permissions shown",
    detail: "Both requested permissions must be visible on Google's screen.",
  },
  {
    id: "authorise",
    label: "Authorise with the designated test account",
    detail: "Use the Google account nominated in the verification submission.",
  },
  {
    id: "return_to_app",
    label: "Return to EarnRoom",
    detail: "The callback confirms the authorisation was stored.",
  },
  {
    id: "channel_shown",
    label: "Connected channel shown in EarnRoom",
    detail: "The channel name and id come back from Google.",
  },
  {
    id: "readonly_demo",
    label: "Demonstrate youtube.readonly",
    detail: "Retrieve the connected channel information live on this page.",
  },
  {
    id: "select_video",
    label: "Select an approved EarnRoom marketing video",
    detail: "Only real, rendered campaign videos appear in the list.",
  },
  {
    id: "real_upload",
    label: "Upload with the real youtube.upload API",
    detail: "The file is sent to YouTube's resumable upload endpoint.",
  },
  {
    id: "youtube_result",
    label: "Show the real YouTube result",
    detail: "The video id and watch URL returned by YouTube.",
  },
  {
    id: "final_state",
    label: "Show EarnRoom's final publishing state",
    detail: "The run is recorded with the confirmed YouTube identifier.",
  },
];

export type DemoRunStatus = "STARTED" | "CHANNEL_VERIFIED" | "UPLOADED" | "COMPLETE" | "FAILED";
export type RecordingStatus =
  "NOT_STARTED" | "RECORDING" | "PAUSED" | "PROCESSING" | "READY" | "FAILED";

export interface DemoRunView {
  id: string;
  status: DemoRunStatus;
  scopes: string[];
  environment: string | null;
  channel: { id: string; title: string; customUrl: string | null } | null;
  marketingVideoId: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  recordingStatus: RecordingStatus;
  recordingBytes: number | null;
  recordingMime: string | null;
  recordingUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Which recorded steps a run can honestly claim, from stored evidence only. */
export function evidencedSteps(run: DemoRunView): DemoStepId[] {
  const done: DemoStepId[] = [];
  if (run.channel) done.push("channel_shown", "readonly_demo");
  if (run.marketingVideoId) done.push("select_video");
  if (run.youtubeVideoId) done.push("real_upload", "youtube_result");
  // The final publishing state is real once YouTube itself confirmed the
  // upload and EarnRoom stored the returned identifier against the run.
  if (uploadConfirmed(run) || run.status === "COMPLETE") done.push("final_state");
  return done;
}

/** True only when YouTube returned an identifier and EarnRoom stored it. */
export function uploadConfirmed(run: DemoRunView): boolean {
  return Boolean(
    run.youtubeVideoId &&
    run.marketingVideoId &&
    (run.status === "UPLOADED" || run.status === "COMPLETE"),
  );
}

/** Plain-English final publishing state, from stored evidence only. */
export function publishingStateLabel(run: DemoRunView): string {
  if (run.status === "FAILED") return "Upload failed — nothing was published";
  if (!uploadConfirmed(run)) return "Not published yet";
  return run.recordingStatus === "READY"
    ? "Published to the connected YouTube channel (private) · recording saved"
    : "Published to the connected YouTube channel (private)";
}

/** What the founder must have on screen in the submitted recording. */
export const RECORDING_CHECKLIST: readonly string[] = [
  "Record the entire screen, so Google's own windows are captured.",
  'Before recording, remove EarnRoom\'s earlier access at myaccount.google.com → Data & privacy → Third-party access, so Google shows the full permission screen instead of "already has some access".',
  "Start on earnroom.co.uk with the address bar visible.",
  "Show the founder console publishing connection and click Connect YouTube.",
  "Capture Google's sign-in, the unverified-app screen if it appears, and both requested YouTube permissions with their tick boxes visible.",
  'If Google still shows "already has some access", click "See the 2 services…" and keep the expanded permission list on screen for a few seconds.',
  "Pause the recording while typing a password or two-factor code, then resume.",
  "Show the return to EarnRoom — the browser lands on a clean founder console page, with no authorisation code in the address bar.",
  "Show the connected channel name and id (youtube.readonly).",
  "Select an approved EarnRoom marketing video and run the real upload (youtube.upload).",
  "Show the YouTube video id and watch URL returned by Google, and open the watch URL.",
  "Finish on EarnRoom's final publishing state for the run.",
];

export function recordingLabel(status: RecordingStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not recording";
    case "RECORDING":
      return "Recording";
    case "PAUSED":
      return "Paused — safe to type credentials";
    case "PROCESSING":
      return "Saving the recording";
    case "READY":
      return "Recording saved";
    case "FAILED":
      return "Recording failed";
  }
}

export function runStatusLabel(status: DemoRunStatus): string {
  switch (status) {
    case "STARTED":
      return "Authorisation in progress";
    case "CHANNEL_VERIFIED":
      return "Channel confirmed";
    case "UPLOADED":
      return "Video uploaded to YouTube";
    case "COMPLETE":
      return "Demonstration complete";
    case "FAILED":
      return "Failed";
  }
}

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /ya29\.[A-Za-z0-9._-]+/g,
  /1\/\/[A-Za-z0-9._-]{20,}/g,
  /\b[A-Za-z0-9_-]{24}\.apps\.googleusercontent\.com\b/g,
  /\bGOCSPX-[A-Za-z0-9_-]+/g,
  /\b(access_token|refresh_token|client_secret|password|otp|mfa)\b\s*[:=]\s*\S+/gi,
];

/**
 * Last line of defence before any diagnostic text reaches the console, the
 * audit trail or the recording overlay.
 */
export function redactSensitive(text: string): string {
  let output = text;
  for (const pattern of SENSITIVE_PATTERNS) output = output.replace(pattern, "[redacted]");
  return output;
}

/** A client id is not a secret, but only the tail is ever shown. */
export function clientHint(clientId: string | null): string {
  if (!clientId) return "Not configured";
  const [prefix] = clientId.split(".apps.googleusercontent.com");
  const head = (prefix ?? clientId).slice(0, 8);
  return `${head}….apps.googleusercontent.com`;
}

export function demoRecordingPath(runId: string, extension: string): string {
  const safe = extension.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "webm";
  return `youtube-oauth-demo/${runId}.${safe}`;
}
