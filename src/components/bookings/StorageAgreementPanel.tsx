/**
 * Bilateral Storage Agreement — two-party acceptance.
 *
 * Each party presses their own button. The server works out who they are from
 * the signed-in session, records one immutable acceptance per party, and only
 * marks the agreement ACTIVE when both have accepted the same version. This
 * component reflects that state; it never decides it.
 */
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/form/Controls";
import { toast } from "@/components/overlay/toast";
import { useAcceptStorageAgreement, useStorageAgreement } from "@/hooks/useStorageAgreement";
import {
  AGREEMENT_ACCEPT_LABEL,
  AGREEMENT_BLOCK_MESSAGE,
  AGREEMENT_CONFIRM_LABEL,
  AGREEMENT_INTRO,
  AGREEMENT_STATUS_LABEL,
  agreementBlock,
  canAccept,
  friendlyAgreementError,
  isAgreementActive,
  viewerAccepted,
} from "@/lib/agreements";
import { formatDate } from "@/lib/format";

export function StorageAgreementPanel({
  bookingId,
  audience,
}: {
  bookingId: string;
  audience: "renter" | "host";
}) {
  const { data: state, isLoading, error } = useStorageAgreement(bookingId);
  const accept = useAcceptStorageAgreement(bookingId);
  const [confirmed, setConfirmed] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">Storage Agreement</h2>
        <p className="mt-2 type-body-sm text-muted-foreground">Loading the Storage Terms…</p>
      </section>
    );
  }

  if (error || !state) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">Storage Agreement</h2>
        <p className="mt-2 type-body-sm text-muted-foreground">
          We can&apos;t load the Storage Terms right now. Please refresh and try again.
        </p>
      </section>
    );
  }

  const version = state.current_version;
  const active = isAgreementActive(state);
  const block = agreementBlock(state);
  const mine = viewerAccepted(state);
  const acceptable = canAccept(state);

  const onAccept = async () => {
    if (!state.agreement) return;
    try {
      await accept.mutateAsync(state.agreement.agreement_version_id);
      toast.success(
        "Storage Terms accepted",
        "We've recorded your acceptance against this version.",
      );
    } catch (cause) {
      toast.error(
        "We couldn't record that",
        friendlyAgreementError(
          cause instanceof Error ? cause.message : "",
          "Please refresh and try again.",
        ),
      );
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3">Storage Agreement</h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            {active
              ? "You and the other party have both accepted the Storage Terms."
              : AGREEMENT_INTRO[audience]}
          </p>
        </div>
        {state.agreement ? (
          <Badge variant={active ? "success" : "warning"}>
            {AGREEMENT_STATUS_LABEL[state.agreement.status]}
          </Badge>
        ) : null}
      </div>

      <ul className="space-y-1 type-body-sm">
        <li>
          {state.agreement?.renter_accepted_at ? "✓" : "•"} Renter{" "}
          {state.agreement?.renter_accepted_at
            ? `accepted on ${formatDate(state.agreement.renter_accepted_at)}`
            : "has not accepted yet"}
        </li>
        <li>
          {state.agreement?.host_accepted_at ? "✓" : "•"} Host{" "}
          {state.agreement?.host_accepted_at
            ? `accepted on ${formatDate(state.agreement.host_accepted_at)}`
            : "has not accepted yet"}
        </li>
      </ul>

      {version ? (
        <div className="rounded-xl bg-muted/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-label">{version.title}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-expanded={termsOpen}
              onClick={() => setTermsOpen((open) => !open)}
            >
              {termsOpen ? "Hide Storage Terms" : "View Storage Terms"}
            </Button>
          </div>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Agreement version: {version.version}
          </p>
          {termsOpen ? (
            <div className="mt-3 space-y-3">
              <p className="type-body-sm text-muted-foreground">{version.summary}</p>
              {version.sections.map((section) => (
                <div key={section.heading}>
                  <h3 className="type-label">{section.heading}</h3>
                  <p className="mt-0.5 type-body-sm text-muted-foreground">{section.body}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {active ? (
        <Alert tone="success" title="Storage Agreement active">
          The items can now be finalised in this storage space. Agreement version:{" "}
          {state.agreement?.agreement_version}.
        </Alert>
      ) : mine ? (
        <Alert tone="info" title="You have accepted the Storage Terms">
          {block ? AGREEMENT_BLOCK_MESSAGE[block] : ""}
        </Alert>
      ) : null}

      {acceptable ? (
        <div className="space-y-3">
          <CheckboxField
            id={`agreement-confirm-${bookingId}`}
            label={AGREEMENT_CONFIRM_LABEL}
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <Button disabled={!confirmed || accept.isPending} onClick={() => void onAccept()}>
            {accept.isPending ? "Recording…" : AGREEMENT_ACCEPT_LABEL}
          </Button>
        </div>
      ) : null}

      {!active && !acceptable && !mine && block ? (
        <Alert tone="warning" title="Storage Terms not accepted yet">
          {AGREEMENT_BLOCK_MESSAGE[block]}
        </Alert>
      ) : null}

      <p className="type-body-xs text-muted-foreground">
        These terms sit alongside EarnRoom&apos;s Storage Rules, which set out what may and may not
        be stored. Your acceptance is recorded against this exact version and is never changed.
      </p>
    </section>
  );
}
