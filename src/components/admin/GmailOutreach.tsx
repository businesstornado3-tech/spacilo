/**
 * Founder Console — Gmail outreach.
 *
 * Shows the honest state of the outreach mailbox and offers the one safe
 * action: a connection test that asks Gmail which account is authorised and
 * sends nothing. No token or credential is ever sent to the browser.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import {
  getGmailOutreachStatus,
  listOutreachOpportunities,
  testGmailOutreachConnection,
  testGmailSendCapability,
  updateOutreachSettings,
  type GmailOutreachSnapshot,
  type OutreachReview,
} from "@/lib/gmail-outreach.functions";
import { cn } from "@/lib/utils";

function tone(status: string): string {
  if (status === "SENDING_READY")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (status === "CONNECTED")
    return "border-success/30 bg-success-soft text-success-soft-foreground";
  if (status === "REAUTHORIZATION_REQUIRED" || status === "SENDING_UNAVAILABLE") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-border bg-secondary text-muted-foreground";
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-GB") : "never";
}

export function GmailOutreach() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getGmailOutreachStatus);
  const runTest = useServerFn(testGmailOutreachConnection);
  const runSendTest = useServerFn(testGmailSendCapability);
  const fetchReview = useServerFn(listOutreachOpportunities);
  const saveOutreach = useServerFn(updateOutreachSettings);
  const [notice, setNotice] = React.useState<string | null>(null);

  const query = useQuery<GmailOutreachSnapshot>({
    queryKey: ["gmail", "outreach"],
    queryFn: () => fetchStatus({}),
  });
  const review = useQuery<OutreachReview>({
    queryKey: ["gmail", "outreach", "review"],
    queryFn: () => fetchReview({}),
  });
  const settings = useMutation({
    mutationFn: (input: {
      mode?: "MANUAL" | "AUTONOMOUS";
      paused?: boolean;
      confirmAutonomous?: boolean;
    }) => saveOutreach({ data: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["gmail", "outreach"] }),
    onError: (error: Error) => setNotice(error.message),
  });
  const test = useMutation({
    mutationFn: () => runTest({}),
    onSuccess: (result) => {
      setNotice(result.detail);
      void queryClient.invalidateQueries({ queryKey: ["gmail", "outreach"] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  const sendTest = useMutation({
    mutationFn: () => runSendTest({ data: { confirm: true } }),
    onSuccess: (result) => {
      setNotice(result.detail);
      void queryClient.invalidateQueries({ queryKey: ["gmail", "outreach"] });
    },
    onError: (error: Error) => setNotice(error.message),
  });

  if (query.isError) {
    return (
      <Alert tone="error" title="Could not load Gmail outreach">
        {(query.error as Error).message}
      </Alert>
    );
  }
  const snapshot = query.data;
  if (!snapshot) return <p className="type-body-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body-sm font-semibold">Account: {snapshot.account}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 type-body-xs font-medium",
            tone(snapshot.view.status),
          )}
        >
          {snapshot.view.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="type-body-sm text-muted-foreground">{snapshot.view.detail}</p>

      <dl className="grid gap-1 type-body-xs text-muted-foreground sm:grid-cols-2">
        <div>Sending: {snapshot.view.sendingReady ? "Ready" : "Not ready"}</div>
        <div>Verified account: {snapshot.verifiedAccount ?? "not checked yet"}</div>
        <div>Last test: {when(snapshot.lastTestAt)}</div>
        <div>Last test send: {when(snapshot.lastTestSendAt)}</div>
        <div>Last outreach: {when(snapshot.lastOutreachAt)}</div>
        <div>Emails sent today: {snapshot.sentToday}</div>
        <div>Errors: {snapshot.errors.length}</div>
      </dl>

      {snapshot.errors.length > 0 ? (
        <ul className="space-y-1 type-body-xs text-destructive">
          {snapshot.errors.map((error) => (
            <li key={`${error.at}-${error.detail}`}>
              {new Date(error.at).toLocaleString("en-GB")}: {error.detail}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => test.mutate()}
          className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-50"
        >
          {test.isPending ? "Checking…" : "Test connection"}
        </button>
        <button
          type="button"
          disabled={sendTest.isPending || !snapshot.view.canTestSend}
          onClick={() => {
            if (
              window.confirm(
                "Send one clearly labelled test email to " +
                  snapshot.account +
                  "? No prospect will be contacted.",
              )
            ) {
              sendTest.mutate();
            }
          }}
          className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-50"
        >
          {sendTest.isPending ? "Sending test…" : "Test send"}
        </button>
      </div>

      {snapshot.view.action !== "NONE" ? (
        <Alert
          tone="warning"
          title={snapshot.view.action === "CONNECT" ? "Connect Gmail" : "Reconnect Gmail"}
        >
          Open Project settings → Connectors and{" "}
          {snapshot.view.action === "CONNECT" ? "connect" : "reconnect"} Gmail as {snapshot.account}
          .
        </Alert>
      ) : null}

      {notice ? (
        <Alert tone="info" title="Connection test">
          {notice}
        </Alert>
      ) : null}

      {/* How outreach runs: one email at a time by default. */}
      {review.data ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="type-body-sm font-semibold">
            Outreach mode:{" "}
            {review.data.settings.mode === "AUTONOMOUS"
              ? "Autonomous (EarnRoom sends approved emails on its own)"
              : "Manual approval (you approve every email)"}
          </p>
          <p className="type-body-xs text-muted-foreground">
            {review.data.settings.paused
              ? "Outreach is paused. Nothing will be sent."
              : `Up to ${review.data.settings.maxDailyAutonomous} emails a day when autonomous. Sent today: ${review.data.sentToday}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={settings.isPending || review.data.settings.mode === "MANUAL"}
              onClick={() => settings.mutate({ mode: "MANUAL" })}
              className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-50"
            >
              Manual approval
            </button>
            <button
              type="button"
              disabled={settings.isPending || review.data.settings.mode === "AUTONOMOUS"}
              onClick={() => {
                if (
                  window.confirm(
                    "Let EarnRoom send approved outreach emails on its own? Every existing safety and eligibility rule still applies.",
                  )
                ) {
                  settings.mutate({ mode: "AUTONOMOUS", confirmAutonomous: true });
                }
              }}
              className="min-h-11 rounded-lg border border-border px-3 type-nav text-muted-foreground hover:bg-secondary disabled:opacity-50"
            >
              Autonomous
            </button>
            <button
              type="button"
              disabled={settings.isPending}
              onClick={() => settings.mutate({ paused: !review.data!.settings.paused })}
              className="min-h-11 rounded-lg border border-border px-3 type-nav text-destructive hover:bg-secondary disabled:opacity-50"
            >
              {review.data.settings.paused ? "Resume outreach" : "Pause outreach"}
            </button>
          </div>
        </div>
      ) : null}

      {/* What EarnRoom found, and the exact email it would send. */}
      {review.data && review.data.cards.length > 0 ? (
        <div className="space-y-3">
          <p className="type-body-sm font-semibold">People EarnRoom has found</p>
          {review.data.cards.map((card) => (
            <article
              key={card.opportunityKey}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <p className="type-body-sm font-semibold">
                {card.prospectType === "HOST" ? "Possible host" : "Possible renter"}
                {card.location ? ` · ${card.location}` : ""}
              </p>
              <p className="type-body-xs text-muted-foreground">
                Found on {card.sourceName}
                {card.sourceReference ? ` · ${card.sourceReference}` : ""}
                {card.observedAt ? ` · ${new Date(card.observedAt).toLocaleString("en-GB")}` : ""}
                {card.discoveredVia ? ` · search: ${card.discoveredVia}` : ""}
              </p>
              <p className="type-body-sm">{card.situation}</p>
              {card.situationEvidence.length > 0 ? (
                <ul className="space-y-1 type-body-xs text-muted-foreground">
                  {card.situationEvidence.slice(0, 3).map((quote) => (
                    <li key={quote}>“{quote}”</li>
                  ))}
                </ul>
              ) : null}
              {card.painPoints.length > 0 ? (
                <ul className="space-y-1 type-body-xs text-muted-foreground">
                  {card.painPoints.slice(0, 3).map((point) => (
                    <li key={point.label}>
                      {point.label}: {point.description}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="type-body-xs text-muted-foreground">{card.relevance}</p>
              <details className="rounded-lg border border-border p-2">
                <summary className="cursor-pointer type-body-xs font-semibold">
                  The exact email that would be sent
                </summary>
                <p className="mt-2 type-body-xs font-semibold">{card.proposedSubject}</p>
                <pre className="mt-1 whitespace-pre-wrap type-body-xs text-muted-foreground">
                  {card.proposedBody}
                </pre>
                <ul className="mt-2 space-y-1 type-body-xs text-muted-foreground">
                  {card.rationale.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
              <p className="type-body-xs text-muted-foreground">
                {card.sendable
                  ? "Ready for your approval."
                  : (card.blockerDetail ?? "This one cannot be sent.")}
              </p>
            </article>
          ))}
        </div>
      ) : review.data ? (
        <p className="type-body-xs text-muted-foreground">
          EarnRoom has not found anyone to contact yet.
        </p>
      ) : null}

      {snapshot.recent.length > 0 ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer type-body-sm font-semibold">Recent outreach</summary>
          <ul className="mt-2 space-y-1 type-body-xs text-muted-foreground">
            {snapshot.recent.map((row) => (
              <li key={`${row.at}-${row.recipient}`}>
                {new Date(row.at).toLocaleString("en-GB")} · {row.recipient} ·{" "}
                {row.prospectType ?? "—"} · {row.source} · {row.status}
                {row.messageId ? ` · ${row.messageId}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="type-body-xs text-muted-foreground">No outreach email has been sent yet.</p>
      )}
    </div>
  );
}
