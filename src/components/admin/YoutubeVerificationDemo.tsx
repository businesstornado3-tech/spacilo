/**
 * Founder-only Google OAuth verification demonstration.
 *
 * This drives the REAL flow: Google's own sign-in and consent screens, a real
 * youtube.readonly channel read, and a real youtube.upload of an approved
 * EarnRoom marketing video. Nothing on this page simulates Google.
 *
 * The recording is made by the founder's own browser with the standard screen
 * capture API, so it captures the genuine screen — including Google's screens,
 * which EarnRoom cannot render or fake. Capture can be paused so passwords and
 * two-factor codes are never recorded.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Copy, Download, Pause, Play, Square, Video } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { LoadingState } from "@/components/common/States";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/overlay/toast";
import {
  RECORDING_CHECKLIST,
  YOUTUBE_DEMO_STEPS,
  evidencedSteps,
  publishingStateLabel,
  recordingLabel,
  runStatusLabel,
  uploadConfirmed,
  type DemoStepId,
  type RecordingStatus,
} from "@/lib/marketing/youtube-demo";
import {
  completeDemoRecording,
  createDemoRecordingSlot,
  getYoutubeDemoOverview,
  startYoutubeDemoRun,
  uploadDemoVideo,
  verifyDemoChannel,
} from "@/lib/youtube-demo.functions";
import { cn } from "@/lib/utils";

const BUCKET = "marketing-videos";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="type-body-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all type-body-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Button({
  onClick,
  disabled,
  variant = "secondary",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 type-nav transition-colors disabled:opacity-50",
        variant === "primary"
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function YoutubeVerificationDemo() {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getYoutubeDemoOverview);
  const startFn = useServerFn(startYoutubeDemoRun);
  const channelFn = useServerFn(verifyDemoChannel);
  const uploadFn = useServerFn(uploadDemoVideo);
  const slotFn = useServerFn(createDemoRecordingSlot);
  const completeFn = useServerFn(completeDemoRecording);

  const overview = useQuery({
    queryKey: ["admin", "youtube-demo"],
    queryFn: () => overviewFn({}),
    refetchInterval: 20_000,
  });

  const [runId, setRunId] = React.useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = React.useState<string>("");
  const [recordingStatus, setRecordingStatus] = React.useState<RecordingStatus>("NOT_STARTED");
  const [captureSupported, setCaptureSupported] = React.useState<boolean | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [manualSteps, setManualSteps] = React.useState<DemoStepId[]>([]);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    setCaptureSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
        typeof window.MediaRecorder !== "undefined",
    );
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "youtube-demo"] });

  const run = overview.data?.runs.find((entry) => entry.id === runId) ?? overview.data?.runs[0] ?? null;
  const activeRunId = runId ?? run?.id ?? null;
  const evidenced = run ? evidencedSteps(run) : [];

  const start = useMutation({
    mutationFn: () => startFn({}),
    onSuccess: (result) => {
      setMessage(result.detail);
      if (result.runId) setRunId(result.runId);
      if (result.ok && result.url) {
        // A new window keeps this page — and the recording — alive throughout.
        window.open(result.url, "_blank", "noopener");
      }
      void invalidate();
    },
  });

  const channel = useMutation({
    mutationFn: (id: string) => channelFn({ data: { runId: id } }),
    onSuccess: (result) => {
      setMessage(result.detail);
      void invalidate();
    },
  });

  const upload = useMutation({
    mutationFn: (input: { runId: string; videoId: string }) => uploadFn({ data: input }),
    onSuccess: (result) => {
      setMessage(result.detail);
      void invalidate();
    },
  });

  async function startRecording() {
    if (!activeRunId) {
      setMessage("Start a demonstration run first, so the recording is filed against it.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void saveRecording(mime);
      recorder.start(2_000);
      recorderRef.current = recorder;
      setRecordingStatus("RECORDING");
      setMessage(
        "Recording. Choose your whole screen so Google's consent screen is captured, and pause before typing any password or two-factor code.",
      );
    } catch {
      setRecordingStatus("NOT_STARTED");
      setMessage("Screen capture was not permitted by the browser.");
    }
  }

  async function saveRecording(mime: string) {
    const id = activeRunId;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (!id) return;
    setRecordingStatus("PROCESSING");
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    try {
      const slot = await slotFn({ data: { runId: id, extension: "webm" } });
      if (!slot.ok || !slot.path || !slot.token) {
        setRecordingStatus("FAILED");
        setMessage(slot.detail);
        return;
      }
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(slot.path, slot.token, blob, {
        contentType: "video/webm",
      });
      if (error) {
        setRecordingStatus("FAILED");
        setMessage("The recording could not be uploaded to private storage.");
        return;
      }
      const done = await completeFn({
        data: { runId: id, path: slot.path, bytes: blob.size, mime: "video/webm", complete: true },
      });
      setRecordingStatus(done.ok ? "READY" : "FAILED");
      setMessage(done.detail);
      void invalidate();
    } catch {
      setRecordingStatus("FAILED");
      setMessage("The recording could not be saved.");
    }
  }

  function pauseRecording() {
    recorderRef.current?.pause();
    setRecordingStatus("PAUSED");
  }
  function resumeRecording() {
    recorderRef.current?.resume();
    setRecordingStatus("RECORDING");
  }
  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  if (overview.isLoading) return <LoadingState label="Loading the verification demonstration…" />;
  if (overview.isError) {
    return <Alert tone="error" title="Not available">You don't have access to this area.</Alert>;
  }
  const data = overview.data!;

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Founder and admin only">
        This page is inside the founder console and every action re-checks admin rights in the
        database. It is not linked from any public page, and it is excluded from search engines.
        No client secret, access token or refresh token is ever shown here or stored in a recording.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Environment" value={data.environment} />
        <Field label="OAuth callback" value={data.callbackUrl} />
        <Field label="Google OAuth client" value={data.clientHint} />
        <Field
          label="Connection"
          value={`${data.connection.state}${data.connection.accountId ? ` · channel ${data.connection.accountId}` : ""}`}
        />
      </div>

      {!data.clientConfigured ? (
        <Alert tone="warning" title="Configuration required">
          The Google application credentials are not set up on this server, so the real OAuth flow
          cannot be started yet.
        </Alert>
      ) : null}

      <section>
        <h3 className="type-h3">Requested permissions and how they are used</h3>
        <ul className="mt-2 space-y-2">
          {data.scopes.map((scope) => (
            <li key={scope.scope} className="rounded-lg border border-border bg-card p-3">
              <p className="type-body-sm font-semibold text-foreground">{scope.short}</p>
              <p className="type-body-xs text-muted-foreground">{scope.scope}</p>
              <p className="mt-1 type-body-sm text-foreground">{scope.use}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="type-h3">Recording</h3>
        {captureSupported === false ? (
          <Alert tone="warning" title="This browser cannot record the screen">
            Use a desktop Chrome, Edge or Firefox window, or record with an external screen
            recorder and keep the rest of this page's flow exactly as it is.
          </Alert>
        ) : (
          <>
            <p className="mt-1 type-body-sm text-muted-foreground">
              Choose <strong>Entire screen</strong> when the browser asks what to share — Google's
              consent screen opens in its own window and can only be captured that way. Pause before
              typing a password or two-factor code.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-secondary px-2.5 py-1 type-body-xs">
                {recordingLabel(recordingStatus)}
              </span>
              {recordingStatus === "NOT_STARTED" || recordingStatus === "READY" || recordingStatus === "FAILED" ? (
                <Button variant="primary" onClick={() => void startRecording()} disabled={!activeRunId}>
                  <Video className="size-4" aria-hidden="true" /> Start recording
                </Button>
              ) : null}
              {recordingStatus === "RECORDING" ? (
                <Button onClick={pauseRecording}>
                  <Pause className="size-4" aria-hidden="true" /> Pause (credentials)
                </Button>
              ) : null}
              {recordingStatus === "PAUSED" ? (
                <Button onClick={resumeRecording}>
                  <Play className="size-4" aria-hidden="true" /> Resume
                </Button>
              ) : null}
              {recordingStatus === "RECORDING" || recordingStatus === "PAUSED" ? (
                <Button onClick={stopRecording}>
                  <Square className="size-4" aria-hidden="true" /> Stop and save
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section>
        <h3 className="type-h3">Run the real demonstration</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => start.mutate()} disabled={!data.clientConfigured || start.isPending}>
            1 · Connect YouTube (real Google sign-in)
          </Button>
          <Button
            onClick={() => activeRunId && channel.mutate(activeRunId)}
            disabled={!activeRunId || channel.isPending}
          >
            2 · Show connected channel (youtube.readonly)
          </Button>
          <Button
            onClick={() =>
              activeRunId && selectedVideo && upload.mutate({ runId: activeRunId, videoId: selectedVideo })
            }
            disabled={!activeRunId || !selectedVideo || upload.isPending}
          >
            3 · Upload the selected video (youtube.upload)
          </Button>
        </div>

        <label className="mt-3 block type-body-sm">
          <span className="text-muted-foreground">Approved EarnRoom marketing video</span>
          <select
            value={selectedVideo}
            onChange={(event) => setSelectedVideo(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-card px-3 type-body-sm"
          >
            <option value="">Select a rendered campaign video…</option>
            {data.videos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.platform} · {video.aspect} · {video.seconds}s · {video.resolution} ·{" "}
                {new Date(video.createdAt).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
        </label>
        {data.videos.length === 0 ? (
          <p className="mt-2 type-body-xs text-muted-foreground">
            No rendered marketing video is stored yet, so there is nothing real to upload.
          </p>
        ) : null}

        {message ? (
          <p className="mt-3 rounded-lg border border-border bg-secondary p-3 type-body-sm">{message}</p>
        ) : null}
      </section>

      <section>
        <h3 className="type-h3">Verification evidence for this run</h3>
        <p className="type-body-xs text-muted-foreground">
          Every value below is stored against the run and comes from Google's own responses. Nothing
          here is filled in by hand.
        </p>
        {run ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field
              label="Connected YouTube channel"
              value={run.channel ? `${run.channel.title} (${run.channel.id})` : "Not retrieved yet"}
            />
            <Field
              label="youtube.readonly evidence"
              value={run.channel ? "Channel details returned live by YouTube" : "Not demonstrated yet"}
            />
            <Field
              label="Selected approved marketing video"
              value={
                run.marketingVideoId
                  ? (data.videos.find((video) => video.id === run.marketingVideoId)
                      ? `${data.videos.find((video) => video.id === run.marketingVideoId)!.platform} · ${
                          data.videos.find((video) => video.id === run.marketingVideoId)!.aspect
                        } · ${data.videos.find((video) => video.id === run.marketingVideoId)!.seconds}s`
                      : run.marketingVideoId)
                  : "Not selected yet"
              }
            />
            <Field
              label="youtube.upload evidence"
              value={
                uploadConfirmed(run)
                  ? "YouTube accepted the file and returned an identifier"
                  : "Not uploaded yet"
              }
            />
            <Field label="YouTube video ID" value={run.youtubeVideoId ?? "—"} />
            <Field
              label="YouTube watch URL"
              value={
                run.youtubeUrl ? (
                  <a href={run.youtubeUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {run.youtubeUrl}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Final EarnRoom publishing state" value={publishingStateLabel(run)} />
            <Field label="Run ID" value={run.id} />
          </div>
        ) : (
          <p className="mt-2 type-body-sm text-muted-foreground">
            Start a demonstration run to collect evidence.
          </p>
        )}
      </section>

      <section>
        <h3 className="type-h3">Demo checklist</h3>

        <p className="type-body-xs text-muted-foreground">
          Ticks marked automatically come from real stored evidence. The rest are yours to confirm
          as you record.
        </p>
        <ul className="mt-2 space-y-1.5">
          {YOUTUBE_DEMO_STEPS.map((step) => {
            const done = evidenced.includes(step.id) || manualSteps.includes(step.id);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() =>
                    setManualSteps((current) =>
                      current.includes(step.id)
                        ? current.filter((entry) => entry !== step.id)
                        : [...current, step.id],
                    )
                  }
                  className="flex w-full items-start gap-2 rounded-lg border border-border bg-card p-2.5 text-left hover:bg-secondary"
                >
                  {done ? (
                    <Check className="mt-0.5 size-4 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span>
                    <span className="type-body-sm font-medium text-foreground">{step.label}</span>
                    <span className="block type-body-xs text-muted-foreground">{step.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="type-h3">Demo history</h3>
        <ul className="mt-2 space-y-3">
          {data.runs.length === 0 ? (
            <li className="type-body-sm text-muted-foreground">No demonstration has been run yet.</li>
          ) : null}
          {data.runs.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-body-sm font-semibold">{runStatusLabel(entry.status)}</p>
                <p className="type-body-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString("en-GB")}
                </p>
              </div>
              <dl className="mt-2 grid gap-1 type-body-xs text-muted-foreground sm:grid-cols-2">
                <div>Run ID: {entry.id}</div>
                <div>Environment: {entry.environment ?? "—"}</div>
                <div>Scopes: {entry.scopes.map((scope) => scope.split("/").pop()).join(", ")}</div>
                <div>
                  Channel:{" "}
                  {entry.channel ? `${entry.channel.title} (${entry.channel.id})` : "not retrieved"}
                </div>
                <div>YouTube video: {entry.youtubeVideoId ?? "—"}</div>
                <div>Recording: {recordingLabel(entry.recordingStatus)}</div>
              </dl>
              {entry.youtubeUrl ? (
                <a
                  href={entry.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block type-body-sm text-primary underline"
                >
                  {entry.youtubeUrl}
                </a>
              ) : null}
              {entry.recordingUrl ? (
                <div className="mt-3 space-y-2">
                  <video src={entry.recordingUrl} controls className="w-full rounded-lg border border-border" />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        void navigator.clipboard.writeText(entry.recordingUrl!);
                        toast.success("Private recording link copied.");
                      }}
                    >
                      <Copy className="size-4" aria-hidden="true" /> Copy link
                    </Button>
                    <a
                      href={entry.recordingUrl}
                      download={`earnroom-youtube-oauth-demo-${entry.id}.webm`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 type-nav hover:bg-secondary"
                    >
                      <Download className="size-4" aria-hidden="true" /> Download
                    </a>
                  </div>
                  <p className="type-body-xs text-muted-foreground">
                    Private link, valid for one hour and only issued to founder accounts. Reload this
                    page for a fresh link.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
