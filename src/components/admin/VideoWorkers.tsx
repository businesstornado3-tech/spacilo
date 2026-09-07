/**
 * Founder Console — video workers.
 *
 * Four routes can make a video: this computer, your own machine running the
 * EarnRoom worker, a free cloud worker, and — only if you deliberately switch
 * it on — a paid one. Nothing is ever charged without being switched on and
 * confirmed, and no worker is described as ready unless it has reported in.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { useVideoWorkers } from "@/hooks/useVideoWorkers";
import {
  CAPABILITY_LABEL,
  RUNTIME_STATUS_LABEL,
  hardwareSummary,
  type WorkerDescriptor,
  type WorkerPreference,
} from "@/lib/marketing/workers";
import { cn } from "@/lib/utils";

const MODE_NOTE: Record<WorkerDescriptor["mode"], string> = {
  BROWSER: "Runs in this browser. Animated video only, and it costs nothing.",
  LOCAL: "Your own machine running the EarnRoom worker. No third-party fee.",
  FREE_CLOUD: "A hosted worker on a free allowance. No charge while the allowance lasts.",
  PAID_CLOUD: "A paid hosted worker. Off unless you switch it on and confirm each video.",
};

const PREFERENCE_OPTIONS: { value: WorkerPreference; label: string }[] = [
  { value: "AUTO", label: "Choose for me (free routes only)" },
  { value: "BROWSER", label: "This browser" },
  { value: "LOCAL", label: "My own machine" },
  { value: "FREE_CLOUD", label: "Free cloud worker" },
  { value: "PAID_CLOUD", label: "Paid cloud worker" },
];

function tone(worker: WorkerDescriptor): string {
  if (worker.status === "OFFLINE" || worker.status === "ERROR" || worker.status === "AUTHENTICATION_FAILED") {
    return "border-destructive/40 bg-destructive/5";
  }
  if (worker.status === "QUOTA_EXHAUSTED" || worker.status === "PAUSED" || worker.status === "LOADING_MODEL") {
    return "border-warning/40 bg-warning/5";
  }
  return "border-border";
}

export function VideoWorkers() {
  const workers = useVideoWorkers(true);
  const snapshot = workers.query.data;
  const [notice, setNotice] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [technical, setTechnical] = React.useState(false);
  const [form, setForm] = React.useState({
    mode: "LOCAL" as "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD",
    label: "",
    endpointUrl: "",
    provider: "",
  });

  if (workers.query.isError) {
    return (
      <Alert tone="error" title="Could not load the video workers">
        {(workers.query.error as Error).message}
      </Alert>
    );
  }
  if (!snapshot) return <p className="type-body-sm text-muted-foreground">Checking this device…</p>;

  const { preferences } = snapshot;
  const costFor = (mode: WorkerDescriptor["mode"]) =>
    snapshot.costLines.find((entry) => entry.mode === mode)?.line ?? "";

  return (
    <div className="space-y-4">
      {notice ? (
        <Alert tone="info" title="Saved">
          {notice}
        </Alert>
      ) : null}

      <p className="type-body-sm text-muted-foreground">{snapshot.routeSummary}</p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {snapshot.workers.map((worker) => (
          <li key={worker.id ?? worker.mode} className={cn("rounded-xl border p-3", tone(worker))}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-sm font-semibold">{worker.label}</span>
              <span className="type-body-xs text-muted-foreground">
                {RUNTIME_STATUS_LABEL[worker.status]}
              </span>
            </div>
            <p className="mt-1 type-body-xs text-muted-foreground">{worker.detail}</p>
            <p className="mt-1 type-body-xs text-muted-foreground">{MODE_NOTE[worker.mode]}</p>
            <p className="mt-1 type-body-xs text-muted-foreground">{costFor(worker.mode)}</p>
            {technical ? (
              <dl className="mt-2 grid gap-0.5 type-body-xs text-muted-foreground">
                <div>Capacity: {CAPABILITY_LABEL[worker.capability]}</div>
                {worker.hardware ? <div>{hardwareSummary(worker.hardware)}</div> : null}
                {worker.installedModels.length > 0 ? (
                  <div>Installed: {worker.installedModels.join(", ")}</div>
                ) : null}
                <div>
                  Last signal:{" "}
                  {worker.lastHeartbeatAt
                    ? new Date(worker.lastHeartbeatAt).toLocaleString("en-GB")
                    : "never"}
                </div>
                <div>Waiting jobs: {worker.queued}</div>
              </dl>
            ) : null}
            {worker.id ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
                  onClick={() =>
                    workers.setEnabled
                      .mutateAsync({ workerId: worker.id!, enabled: !worker.enabled })
                      .then(() =>
                        setNotice(
                          worker.enabled
                            ? `${worker.label} switched off.`
                            : `${worker.label} switched on.`,
                        ),
                      )
                  }
                >
                  {worker.enabled ? "Switch off" : "Switch on"}
                </button>
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary"
                  onClick={() =>
                    workers.remove
                      .mutateAsync(worker.id!)
                      .then(() => setNotice(`${worker.label} removed.`))
                  }
                >
                  Remove
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="type-body-xs text-muted-foreground underline"
        onClick={() => setTechnical((value) => !value)}
      >
        {technical ? "Hide technical details" : "View technical details"}
      </button>

      <div className="rounded-xl border border-border p-4">
        <h4 className="type-h5">Add a worker</h4>
        <p className="mt-1 type-body-xs text-muted-foreground">
          You'll get an access token once. Put it on the machine running the worker — EarnRoom
          keeps only a fingerprint of it.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="type-body-xs">
            Kind
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
              value={form.mode}
              onChange={(event) =>
                setForm({ ...form, mode: event.target.value as typeof form.mode })
              }
            >
              <option value="LOCAL">My own machine</option>
              <option value="FREE_CLOUD">Free cloud worker</option>
              <option value="PAID_CLOUD">Paid cloud worker</option>
            </select>
          </label>
          <label className="type-body-xs">
            Name
            <input
              className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="Studio desktop"
            />
          </label>
          <label className="type-body-xs">
            Address (optional)
            <input
              className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
              value={form.endpointUrl}
              onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })}
              placeholder="https://…"
            />
          </label>
          <label className="type-body-xs">
            Service name (optional)
            <input
              className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={form.label.trim().length < 2 || workers.register.isPending}
          className="mt-3 min-h-10 rounded-lg bg-primary px-3 type-body-sm text-primary-foreground disabled:opacity-50"
          onClick={() =>
            workers.register
              .mutateAsync({
                mode: form.mode,
                label: form.label.trim(),
                endpointUrl: form.endpointUrl.trim() || null,
                provider: form.provider.trim() || null,
              })
              .then((result) => {
                setToken(result.token);
                setForm({ ...form, label: "", endpointUrl: "", provider: "" });
              })
              .catch((error: Error) => setNotice(error.message))
          }
        >
          Add worker
        </button>
        {token ? (
          <Alert tone="warning" title="Copy this access token now">
            <code className="break-all type-body-xs">{token}</code>
            <p className="mt-1 type-body-xs">It is shown once and cannot be retrieved again.</p>
          </Alert>
        ) : null}
      </div>

      <div className="rounded-xl border border-border p-4">
        <h4 className="type-h5">How videos get made</h4>
        <label className="mt-2 block type-body-xs">
          Preferred route
          <select
            className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
            value={preferences.defaultWorker}
            onChange={(event) =>
              workers.preferences
                .mutateAsync({ defaultWorker: event.target.value })
                .then(() => setNotice("Preferred route saved."))
            }
          >
            {PREFERENCE_OPTIONS.filter(
              (option) => option.value !== "PAID_CLOUD" || preferences.paidComputeEnabled,
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 space-y-2">
          {(
            [
              ["paidComputeEnabled", "Allow paid video generation", preferences.paidComputeEnabled],
              ["autonomousGeneration", "Let the engine make videos on its own", preferences.autonomousGeneration],
              ["autonomousPublishing", "Let the engine publish approved videos", preferences.autonomousPublishing],
              ["generationPaused", "Pause all video making", preferences.generationPaused],
              ["publishingPaused", "Pause all publishing", preferences.publishingPaused],
            ] as const
          ).map(([key, label, value]) => (
            <label key={key} className="flex items-center gap-2 type-body-sm">
              <input
                type="checkbox"
                checked={value}
                onChange={(event) =>
                  workers.preferences
                    .mutateAsync({ [key]: event.target.checked })
                    .then(() => setNotice(`${label} — saved.`))
                }
              />
              {label}
            </label>
          ))}
        </div>

        <p className="mt-3 type-body-xs text-muted-foreground">
          Paid video making is off until you switch it on, and each paid video still has to be
          confirmed on its own. Daily limit £{(preferences.spend.perDayPence / 100).toFixed(2)}, up
          to £{(preferences.spend.perVideoPence / 100).toFixed(2)} per video.
        </p>
      </div>
    </div>
  );
}
