/**
 * Founder Console — real acquisition status.
 *
 * Every number here comes from production records. Where nothing real has
 * happened yet, it shows zero rather than an encouraging estimate.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getAcquisitionStatus, type AcquisitionSnapshot } from "@/lib/acquisition.functions";
import type { AcquisitionStatus as Status } from "@/lib/marketing/acquisition";

const TONE: Record<Status, string> = {
  LIVE: "bg-success/10 text-success border-success/30",
  MOCK: "bg-muted text-muted-foreground border-border",
  NOT_CONNECTED: "bg-muted text-muted-foreground border-border",
  AUTH_REQUIRED: "bg-warning/10 text-warning border-warning/30",
  PLATFORM_APPROVAL_REQUIRED: "bg-warning/10 text-warning border-warning/30",
  CONFIGURATION_REQUIRED: "bg-warning/10 text-warning border-warning/30",
  BLOCKED_BY_POLICY: "bg-muted text-muted-foreground border-border",
  FAILED: "bg-destructive/10 text-destructive border-destructive/30",
};

const LABEL: Record<Status, string> = {
  LIVE: "Live",
  MOCK: "Practice mode",
  NOT_CONNECTED: "Not connected",
  AUTH_REQUIRED: "Sign-in needed",
  PLATFORM_APPROVAL_REQUIRED: "Platform approval needed",
  CONFIGURATION_REQUIRED: "Setup needed",
  BLOCKED_BY_POLICY: "Held by your rules",
  FAILED: "Last attempt failed",
};

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {LABEL[status]}
    </span>
  );
}

const FUNNEL: { key: keyof AcquisitionSnapshot["evidence"]; label: string }[] = [
  { key: "opportunities", label: "Opportunities found" },
  { key: "interpreted", label: "Understood in depth" },
  { key: "campaigns", label: "Campaigns created" },
  { key: "contentGenerated", label: "Content made" },
  { key: "validated", label: "Checked and safe" },
  { key: "eligibleForDelivery", label: "Cleared to go out" },
  { key: "realDeliveries", label: "Actually sent or posted" },
  { key: "referredVisits", label: "Visits traced back" },
  { key: "registrations", label: "Sign-ups" },
  { key: "bookings", label: "Bookings" },
  { key: "completedBookings", label: "Completed bookings" },
];

export function AcquisitionStatus() {
  const fetchStatus = useServerFn(getAcquisitionStatus);
  const query = useQuery<AcquisitionSnapshot>({
    queryKey: ["marketing", "acquisition"],
    queryFn: () => fetchStatus({}),
  });

  const [showAll, setShowAll] = React.useState(false);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Checking what is genuinely live…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">Could not read the acquisition status.</p>;
  }

  const { channels, evidence, sends } = query.data;
  const live = channels.filter((channel) => channel.status === "LIVE");
  const visible = showAll ? channels : channels.filter((channel) => channel.status !== "MOCK");

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="type-heading-sm">What is actually reaching people</h2>
        <p className="text-sm text-muted-foreground">
          {live.length === 0
            ? "Nothing is going out to the public yet. Each route below says exactly what it still needs."
            : `${live.length} route${live.length === 1 ? "" : "s"} can reach people right now.`}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((channel) => (
          <article key={`${channel.kind}-${channel.key}`} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{channel.label}</p>
                <p className="text-xs text-muted-foreground">
                  {channel.kind === "social" ? "Social posting" : "Direct outreach"}
                </p>
              </div>
              <StatusPill status={channel.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{channel.detail}</p>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        className="text-sm underline underline-offset-4"
      >
        {showAll ? "Hide practice-mode routes" : "Show practice-mode routes"}
      </button>

      <div className="rounded-xl border border-border p-4">
        <h3 className="font-medium">From opportunity to booking</h3>
        <p className="text-xs text-muted-foreground">
          Counted from real records only. Zero means it has not happened yet.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {FUNNEL.map((step) => (
            <div key={step.key} className="rounded-lg bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{step.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{evidence[step.key]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h3 className="font-medium">Every send attempt</h3>
        {sends.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No attempts have been made yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sends.slice(0, 20).map((send, index) => (
              <li key={`${send.campaignId}-${index}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{send.channel}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                    {send.executionMode === "LIVE" ? "Real send" : "Practice"}
                  </span>
                  <span className="text-xs text-muted-foreground">{send.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {send.attemptedAt ? new Date(send.attemptedAt).toLocaleString("en-GB") : "—"}
                  {send.externalId ? ` · confirmed id ${send.externalId}` : " · no platform confirmation"}
                  {send.retryCount > 0 ? ` · ${send.retryCount} retries` : ""}
                </p>
                {send.externalUrl ? (
                  <a
                    className="text-xs underline underline-offset-4"
                    href={send.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View the live post
                  </a>
                ) : null}
                {send.error ? <p className="text-xs text-destructive">{send.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
