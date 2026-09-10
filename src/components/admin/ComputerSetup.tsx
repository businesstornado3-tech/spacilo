/**
 * Founder Console — "Set up my computer".
 *
 * One button. EarnRoom opens a short-lived setup session, downloads the real
 * Windows worker installer, and then waits for the machine itself to report
 * in. Every line on screen is driven by a signal that actually arrived: no
 * step is ticked because time passed.
 *
 * Nothing secret is displayed. The installer pairs itself and the worker
 * creates its own key on the machine.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import {
  beginComputerSetup,
  getComputerSetupStatus,
  type ComputerSetupSession,
} from "@/lib/marketing-workers.functions";
import {
  capabilityVerdict,
  COMPUTER_SETUP_STATE_LABEL,
  computerSetupState,
  hardwareSummary,
  READY_STATUSES,
  SETUP_JOURNEY,
  SETUP_STAGE_LABEL,
  setupView,
} from "@/lib/marketing/workers";
import { cn } from "@/lib/utils";

export function ComputerSetup({ onConnected }: { onConnected?: () => void }) {
  const queryClient = useQueryClient();
  const begin = useServerFn(beginComputerSetup);
  const status = useServerFn(getComputerSetupStatus);

  const [session, setSession] = React.useState<ComputerSetupSession | null>(null);
  const [downloadStarted, setDownloadStarted] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("My computer");
  // True when the founder says this machine already runs the worker, so we
  // pair the running worker instead of downloading anything again.
  const [alreadyInstalled, setAlreadyInstalled] = React.useState(false);

  const poll = useQuery({
    queryKey: ["marketing", "computer-setup", session?.handle ?? "none"],
    queryFn: () => status({ data: { handle: session!.handle } }),
    enabled: Boolean(session),
    refetchInterval: 5_000,
  });

  /** Downloads a file the browser was handed by our own server. */
  const deliver = async (path: string): Promise<boolean> => {
    const response = await fetch(path);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setProblem(body.error ?? "The file could not be downloaded.");
      return false;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = path.split("/").pop()!;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  };

  const start = useMutation({
    mutationFn: (installed: boolean) =>
      begin({ data: { label: label.trim() || "My computer" } }).then((created) => ({
        created,
        installed,
      })),
    onSuccess: async ({ created, installed }) => {
      setProblem(null);
      setDownloadStarted(false);
      setAlreadyInstalled(installed);
      setSession(created);
      if (installed) {
        // Already installed: hand the running worker its setup session only.
        await deliver(created.pairingPath);
        return;
      }
      if (!created.installerAvailable) return;
      if (await deliver(created.downloadPath)) setDownloadStarted(true);
    },
    onError: (failure: Error) => setProblem(failure.message),
  });

  const worker = poll.data?.worker ?? null;
  const view = setupView({
    sessionCreated: Boolean(session),
    downloadStarted,
    claimed: poll.data?.claimed ?? false,
    heartbeatAt: poll.data?.heartbeatAt ?? null,
    hardware: worker?.hardware ?? null,
    expired: poll.data?.expired ?? false,
    installerAvailable: session ? session.installerAvailable || alreadyInstalled : true,
  });

  const state = computerSetupState({
    sessionCreated: Boolean(session),
    downloadStarted,
    claimed: poll.data?.claimed ?? false,
    heartbeatAt: poll.data?.heartbeatAt ?? null,
    hardware: worker?.hardware ?? null,
    expired: poll.data?.expired ?? false,
    installerAvailable: session ? session.installerAvailable : true,
    alreadyInstalled,
    workerReady: Boolean(worker && worker.enabled && READY_STATUSES.includes(worker.status)),
  });

  const connectedRef = React.useRef(false);
  React.useEffect(() => {
    if (view.connected && !connectedRef.current) {
      connectedRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["marketing", "workers"] });
      onConnected?.();
    }
  }, [view.connected, onConnected, queryClient]);

  const verdict = worker?.hardware ? capabilityVerdict(worker.hardware) : null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
      {!session ? (
        <>
          <p className="type-body-sm font-semibold">Connect a Windows computer</p>
          <p className="mt-1 type-body-xs text-muted-foreground">
            EarnRoom downloads its Windows video worker, you open it once, and the computer connects
            itself. Nothing to copy, and no password or code to handle.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="type-body-xs">
              Name this computer
              <input
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 type-body-sm"
              />
            </label>
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate(false)}
              className="min-h-11 rounded-lg bg-primary px-3 type-nav font-semibold text-primary-foreground disabled:opacity-50"
            >
              {start.isPending ? SETUP_STAGE_LABEL.PREPARING : "Set up my computer"}
            </button>
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate(true)}
              className="min-h-11 rounded-lg border border-border px-3 type-nav font-semibold disabled:opacity-50"
            >
              Pair this computer — worker already installed
            </button>
          </div>
          <p className="mt-2 type-body-xs text-muted-foreground">
            Already installed and showing “Needs setup”? Choose “Pair this computer”. EarnRoom sends
            a small file — open it once on that computer and the worker connects itself. Nothing is
            downloaded again.
          </p>
        </>
      ) : (
        <>
          <p className="type-body-xs text-muted-foreground">{COMPUTER_SETUP_STATE_LABEL[state]}</p>
          <p className="type-body-sm font-semibold">
            {alreadyInstalled && !view.connected
              ? "Waiting for this computer to connect"
              : view.label}
          </p>
          <p className="mt-1 type-body-xs text-muted-foreground">
            {alreadyInstalled && !view.connected
              ? "Open the small pairing file EarnRoom just sent on that computer. The worker checks for it every few seconds and will connect by itself."
              : view.detail}
          </p>

          {view.stage !== "UNAVAILABLE" && view.stage !== "EXPIRED" ? (
            <ol className="mt-3 space-y-1">
              {SETUP_JOURNEY.map((stage) => {
                const done = view.completed.includes(stage) || view.stage === "CONNECTED";
                const current = view.stage === stage;
                return (
                  <li
                    key={stage}
                    className={cn(
                      "type-body-xs",
                      done
                        ? "text-success-soft-foreground"
                        : current
                          ? "font-semibold"
                          : "text-muted-foreground",
                    )}
                  >
                    {done ? "✓ " : current ? "• " : "  "}
                    {SETUP_STAGE_LABEL[stage]}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {verdict ? (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <p className="type-body-sm font-semibold">{verdict.headline}</p>
              <p className="mt-1 type-body-xs text-muted-foreground">{verdict.detail}</p>
              {worker?.hardware ? (
                <p className="mt-1 type-body-xs text-muted-foreground">
                  {hardwareSummary(worker.hardware)}
                </p>
              ) : null}
            </div>
          ) : null}

          {view.stage === "EXPIRED" || view.stage === "UNAVAILABLE" ? (
            <button
              type="button"
              className="mt-3 min-h-10 rounded-lg border border-border px-3 type-body-sm hover:bg-secondary"
              onClick={() => {
                setSession(null);
                setDownloadStarted(false);
                setAlreadyInstalled(false);
              }}
            >
              Start again
            </button>
          ) : null}
        </>
      )}

      {problem ? (
        <Alert tone="error" title="Setup could not continue">
          {problem}
        </Alert>
      ) : null}
    </div>
  );
}
