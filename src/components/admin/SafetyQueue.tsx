/**
 * Founder Safety queue.
 *
 * A view over the EXISTING support cases — nothing here is a second support
 * system. A case appears once staff have given it a safety severity. Actions
 * reuse the existing controls: severity, and the listing/booking/account
 * safety suspensions, which are recorded and never delete anything.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import {
  SAFETY_DANGER_NOTICE,
  SCOPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SEVERITY_TONE,
  SOURCE_LABEL,
  countBySeverity,
  isOpenCase,
  sortBySeverity,
  type SafetyCaseRow,
  type SafetyControlRow,
} from "@/lib/admin/safety";
import { useLiftSafetySuspension } from "@/hooks/useSafetyQueue";
import { formatDate } from "@/lib/format";

export function SafetyQueue({
  cases,
  controls,
}: {
  cases: SafetyCaseRow[];
  controls: SafetyControlRow[];
}) {
  const lift = useLiftSafetySuspension();
  const counts = countBySeverity(cases);
  const ordered = sortBySeverity(cases);
  const open = ordered.filter(isOpenCase);

  const onLift = async (row: SafetyControlRow) => {
    try {
      await lift.mutateAsync({ suspensionId: row.id, reason: "Lifted after review" });
      toast.success("Control lifted", "The suspension has been recorded as lifted.");
    } catch (cause) {
      toast.error(
        "We couldn't lift that",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SEVERITY_ORDER.map((severity) => (
          <div key={severity} className="rounded-xl border border-border bg-card p-4">
            <dt className="type-body-xs text-muted-foreground">{SEVERITY_LABEL[severity]}</dt>
            <dd className="type-h3">{counts[severity]}</dd>
          </div>
        ))}
      </dl>

      <p className="type-body-sm text-muted-foreground">
        {open.length} open safety {open.length === 1 ? "case" : "cases"} of {cases.length} flagged.
        Severity and source are set by staff; nothing is flagged automatically by the item scanner.
      </p>

      <Alert tone="warning" title="Handling guidance">
        {SAFETY_DANGER_NOTICE}
      </Alert>

      {ordered.length === 0 ? (
        <Alert tone="success" title="No safety cases">
          No support case has been given a safety severity.
        </Alert>
      ) : (
        <ul className="space-y-2">
          {ordered.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="type-label">{row.summary}</p>
                  <p className="mt-0.5 type-body-xs text-muted-foreground">
                    {row.reference} · {row.category} · {row.stage} ·{" "}
                    {row.source ? SOURCE_LABEL[row.source] : "Source not set"} ·{" "}
                    {formatDate(row.created_at)}
                  </p>
                  <p className="mt-0.5 type-body-xs text-muted-foreground">
                    Case status: {row.status} · Booking: {row.booking_status ?? "unknown"} ·{" "}
                    {row.evidence_count} evidence{" "}
                    {row.evidence_count === 1 ? "item" : "items"}
                    {row.payment_hold ? " · payment on hold" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.severity ? (
                    <Badge
                      variant={SEVERITY_TONE[row.severity] === "error" ? "destructive" : "warning"}
                    >
                      {SEVERITY_LABEL[row.severity]}
                    </Badge>
                  ) : null}
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/admin/support/$caseId" params={{ caseId: row.id }}>
                      Open case
                    </Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="type-h4">Active controls</h3>
        {controls.length === 0 ? (
          <p className="mt-2 type-body-sm text-muted-foreground">
            No listing, booking, storage arrangement or account is currently under a safety control.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {controls.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="type-label">
                    {SCOPE_LABEL[row.scope]} · {row.state === "suspended" ? "Suspended" : "Under safety review"}
                  </p>
                  <p className="mt-0.5 type-body-xs text-muted-foreground">
                    {row.reason} · {SOURCE_LABEL[row.source]} · {formatDate(row.created_at)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={lift.isPending}
                  onClick={() => void onLift(row)}
                >
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
