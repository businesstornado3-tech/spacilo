/**
 * Founder Console — how EarnRoom makes a video.
 *
 * Four plain choices: this browser, your own computer, a free cloud worker, and
 * — only if deliberately switched on — a paid one. The technical registry,
 * tokens, addresses and heartbeats stay behind "Advanced worker administration".
 *
 * Presentation only. Nothing here claims a route is ready unless a real worker
 * has reported in, and no paid route is ever reached automatically.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { useVideoWorkers } from "@/hooks/useVideoWorkers";
import {
  CAPABILITY_LABEL,
  READY_STATUSES,
  RUNTIME_STATUS_LABEL,
  hardwareSummary,
  type WorkerDescriptor,
  type WorkerMode,
  type WorkerPreference,
} from "@/lib/marketing/workers";
import { cn } from "@/lib/utils";

type CardCopy = {
  mode: WorkerMode;
  title: string;
  badge: string;
  description: string;
  connectedDescription: string;
  setupLabel: string;
};

const CARDS: readonly CardCopy[] = [
  {
    mode: "BROWSER",
    title: "Browser",
    badge: "Free",
    description:
      "Make a video directly in this browser. No installation and no third-party video-generation service is required.",
    connectedDescription:
      "Make a video directly in this browser. No installation and no third-party video-generation service is required.",
    setupLabel: "",
  },
  {
    mode: "LOCAL",
    title: "My computer",
    badge: "Free",
    description:
      "Use your own computer to make videos locally. No third-party video-generation fee.",
    connectedDescription: "Your computer is connected and ready to make videos.",
    setupLabel: "Set up my computer",
  },
  {
    mode: "FREE_CLOUD",
    title: "Free cloud",
    badge: "Free",
    description: "Use an available free cloud GPU worker when one is available.",
    connectedDescription: "A free cloud worker is connected and ready to make videos.",
    setupLabel: "Set up free cloud",
  },
  {
    mode: "PAID_CLOUD",
    title: "Paid cloud",
    badge: "Optional",
    description: "Paid cloud generation is disabled until you explicitly enable it.",
    connectedDescription: "Paid cloud generation is enabled. Every video still needs confirming.",
    setupLabel: "Enable paid cloud",
  },
];

const PREFERENCE_OPTIONS: { value: WorkerPreference; label: string }[] = [
  { value: "AUTO", label: "Choose for me (free routes only)" },
  { value: "BROWSER", label: "Browser" },
  { value: "LOCAL", label: "My computer" },
  { value: "FREE_CLOUD", label: "Free cloud" },
  { value: "PAID_CLOUD", label: "Paid cloud" },
];

/** Setup guidance. Honest: no installer is offered because none exists yet. */
const SETUP_STEPS: Partial<Record<WorkerMode, { title: string; steps: string[]; note: string }>> = {
  LOCAL: {
    title: "Install the EarnRoom video worker on your computer",
    steps: [
      "The worker application runs on a computer with a dedicated graphics card and reports in to EarnRoom on its own.",
      "Add the computer under Advanced worker administration to get its one-time access token.",
      "Put that token on the computer running the worker. EarnRoom keeps only a fingerprint of it.",
    ],
    note: "A ready-made installer download is not available yet, so this step still needs a person to set the worker running on the machine.",
  },
  FREE_CLOUD: {
    title: "Connect a free cloud worker",
    steps: [
      "A free cloud worker is a GPU machine running the EarnRoom worker on a free allowance.",
      "Add it under Advanced worker administration with its address to get a one-time access token.",
      "It appears here as ready only once it has actually checked in.",
    ],
    note: "No free cloud worker is deployed for EarnRoom yet. Nothing here is simulated — the card stays 'Not connected' until a real worker reports in.",
  },
};

function statusWord(
  worker: WorkerDescriptor | null,
  mode: WorkerMode,
  paidEnabled: boolean,
): string {
  if (mode === "PAID_CLOUD" && !paidEnabled) return "DISABLED";
  if (!worker) return "NOT CONNECTED";
  if (!worker.enabled) return "PAUSED";
  if (READY_STATUSES.includes(worker.status)) return "READY";
  if (worker.status === "BUSY") return "BUSY";
  if (worker.status === "QUOTA_EXHAUSTED") return "ACTION REQUIRED";
  if (worker.status === "AUTHENTICATION_FAILED" || worker.status === "ERROR") {
    return "ACTION REQUIRED";
  }
  if (worker.status === "PAUSED") return "PAUSED";
  return "NOT CONNECTED";
}

function statusTone(word: string): string {
  if (word === "READY") return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (word === "ACTION REQUIRED") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (word === "BUSY" || word === "PAUSED") {
    return "border-warning/30 bg-warning-soft text-warning-soft-foreground";
  }
  return "border-border bg-secondary text-muted-foreground";
}

function jumpToGenerator() {
  document.getElementById("today")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function VideoWorkers() {
  const workers = useVideoWorkers(true);
  const snapshot = workers.query.data;
  const [notice, setNotice] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [setupFor, setSetupFor] = React.useState<WorkerMode | null>(null);
  const [form, setForm] = React.useState({
    mode: "LOCAL" as "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD",
    label: "",
    endpointUrl: "",
    provider: "",
  });

  if (workers.query.isError) {
    return (
      <Alert tone="error" title="Could not load the video routes">
        {(workers.query.error as Error).message}
      </Alert>
    );
  }
  if (!snapshot) return <p className="type-body-sm text-muted-foreground">Checking this device…</p>;

  const { preferences } = snapshot;
  const costFor = (mode: WorkerMode) =>
    snapshot.costLines.find((entry) => entry.mode === mode)?.line ?? "";

  /** The worker that best represents a mode: a ready one wins over a silent one. */
  const workerFor = (mode: WorkerMode): WorkerDescriptor | null => {
    const all = snapshot.workers.filter((worker) => worker.mode === mode);
    if (all.length === 0) return null;
    return (
      all.find((worker) => worker.enabled && READY_STATUSES.includes(worker.status)) ?? all[0]!
    );
  };

  const chooseRoute = (value: WorkerPreference, message: string) =>
    workers.preferences.mutateAsync({ defaultWorker: value }).then(() => setNotice(message));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="type-h4">Choose how EarnRoom should make your video</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Choose a free option whenever possible. Paid generation stays disabled unless you
          explicitly enable it.
        </p>
      </div>

      {notice ? (
        <Alert tone="info" title="Saved">
          {notice}
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((card) => {
          const worker = workerFor(card.mode);
          const word = statusWord(worker, card.mode, preferences.paidComputeEnabled);
          const ready = word === "READY" && card.mode !== "PAID_CLOUD";
          const selected = preferences.defaultWorker === card.mode;
          return (
            <li
              key={card.mode}
              className={cn(
                "rounded-xl border p-4",
                selected ? "border-primary bg-primary-soft/30" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-body-sm font-semibold">{card.title}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 type-body-xs text-muted-foreground">
                    {card.badge}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 type-body-xs font-medium",
                      statusTone(word),
                    )}
                  >
                    {word}
                  </span>
                </span>
              </div>

              <p className="mt-2 type-body-sm text-muted-foreground">
                {ready ? card.connectedDescription : card.description}
              </p>
              <p className="mt-1 type-body-xs text-muted-foreground">{costFor(card.mode)}</p>

              {worker && card.mode !== "BROWSER" ? (
                <dl className="mt-2 grid gap-0.5 type-body-xs text-muted-foreground">
                  <div>Hardware: {worker.hardware ? "detected" : "not reported"}</div>
                  <div>Capability: {CAPABILITY_LABEL[worker.capability]}</div>
                </dl>
              ) : null}
              {worker && !READY_STATUSES.includes(worker.status) && worker.detail ? (
                <p className="mt-1 type-body-xs text-muted-foreground">{worker.detail}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {ready ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-primary px-3 type-nav font-semibold text-primary-foreground"
                    onClick={() =>
                      chooseRoute(
                        card.mode,
                        `${card.title} chosen. Pick the campaign asset below to generate.`,
                      ).then(jumpToGenerator)
                    }
                  >
                    Generate video
                  </button>
                ) : card.mode === "PAID_CLOUD" ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
                    onClick={() =>
                      workers.preferences
                        .mutateAsync({ paidComputeEnabled: !preferences.paidComputeEnabled })
                        .then(() =>
                          setNotice(
                            preferences.paidComputeEnabled
                              ? "Paid cloud generation disabled."
                              : "Paid cloud generation enabled. Every paid video still has to be confirmed on its own.",
                          ),
                        )
                    }
                  >
                    {preferences.paidComputeEnabled ? "Disable paid cloud" : "Enable paid cloud"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary"
                    onClick={() => setSetupFor(setupFor === card.mode ? null : card.mode)}
                    aria-expanded={setupFor === card.mode}
                  >
                    {card.setupLabel}
                  </button>
                )}
              </div>

              {setupFor === card.mode && SETUP_STEPS[card.mode] ? (
                <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
                  <p className="type-body-sm font-semibold">{SETUP_STEPS[card.mode]!.title}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 type-body-xs text-muted-foreground">
                    {SETUP_STEPS[card.mode]!.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="mt-2 type-body-xs text-warning-soft-foreground">
                    {SETUP_STEPS[card.mode]!.note}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-border p-4">
        <h4 className="type-h5">Choose for me</h4>
        <p className="mt-1 type-body-sm text-muted-foreground">
          EarnRoom will choose the best available free video worker. It never uses paid cloud on its
          own, and every paid video needs its own confirmation.
        </p>
        <label className="mt-3 block type-body-xs">
          Preferred route
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
            value={preferences.defaultWorker}
            onChange={(event) =>
              chooseRoute(event.target.value as WorkerPreference, "Preferred route saved.")
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
        <p className="mt-2 type-body-xs text-muted-foreground">{snapshot.routeSummary}</p>
      </div>

      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer type-body-sm font-semibold">
          Advanced worker administration
        </summary>

        <div className="mt-4 space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {snapshot.workers.map((worker) => (
              <li key={worker.id ?? worker.mode} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="type-body-sm font-semibold">{worker.label}</span>
                  <span className="type-body-xs text-muted-foreground">
                    {RUNTIME_STATUS_LABEL[worker.status]}
                  </span>
                </div>
                <dl className="mt-2 grid gap-0.5 type-body-xs text-muted-foreground">
                  <div>Mode: {worker.mode}</div>
                  <div>Capability: {CAPABILITY_LABEL[worker.capability]}</div>
                  {worker.hardware ? <div>{hardwareSummary(worker.hardware)}</div> : null}
                  {worker.installedModels.length > 0 ? (
                    <div>Installed: {worker.installedModels.join(", ")}</div>
                  ) : null}
                  <div>
                    Last check-in:{" "}
                    {worker.lastHeartbeatAt
                      ? new Date(worker.lastHeartbeatAt).toLocaleString("en-GB")
                      : "never"}
                  </div>
                  <div>Waiting jobs: {worker.queued}</div>
                  {worker.id ? <div>Worker reference: {worker.id}</div> : null}
                </dl>
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

          <div className="rounded-lg border border-border p-3">
            <h5 className="type-body-sm font-semibold">Add a worker</h5>
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
                  <option value="LOCAL">My own computer</option>
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

          <div className="rounded-lg border border-border p-3">
            <h5 className="type-body-sm font-semibold">Generation controls</h5>
            <div className="mt-2 space-y-2">
              {(
                [
                  [
                    "paidComputeEnabled",
                    "Allow paid video generation",
                    preferences.paidComputeEnabled,
                  ],
                  [
                    "autonomousGeneration",
                    "Let the engine make videos on its own",
                    preferences.autonomousGeneration,
                  ],
                  [
                    "autonomousPublishing",
                    "Let the engine publish approved videos",
                    preferences.autonomousPublishing,
                  ],
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
              confirmed on its own. Daily limit £{(preferences.spend.perDayPence / 100).toFixed(2)},
              up to £{(preferences.spend.perVideoPence / 100).toFixed(2)} per video.
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
