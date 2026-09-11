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
  testGmailOutreachConnection,
  type GmailOutreachSnapshot,
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
  const [notice, setNotice] = React.useState<string | null>(null);

  const query = useQuery<GmailOutreachSnapshot>({
    queryKey: ["gmail", "outreach"],
    queryFn: () => fetchStatus({}),
  });
  const test = useMutation({
    mutationFn: () => runTest({}),
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
