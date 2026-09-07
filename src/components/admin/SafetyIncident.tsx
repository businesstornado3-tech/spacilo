/**
 * Founder Console → Safety → incident dossier.
 *
 * A read view over the EXISTING support case, booking, storage request,
 * space, bilateral storage agreement, inventory, policy, evidence, control
 * and audit records. It creates nothing: every action here calls a control
 * that already existed and is authorised again in the database.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { formatDate, formatPrice } from "@/lib/format";
import {
  AI_NOT_PROOF_NOTICE,
  CONTROL_STATE_LABEL,
  NO_AUTHORITY_NOTICE,
  POLICY_SOURCE_NOTICE,
  activeControls,
  addressLines,
  agreementSummary,
  allowedSeverityChanges,
  handoverState,
  hazardLabel,
  heldPayments,
  isProminent,
  personName,
  policyOutcome,
  policyResultLabel,
  readItem,
  relevantItems,
  safetyActionLine,
  severityHeadline,
  type IncidentDossier,
} from "@/lib/admin/incident";
import {
  SAFETY_DANGER_NOTICE,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  SCOPE_LABEL,
  type SafetySeverity,
  type SafetySource,
} from "@/lib/admin/safety";
import {
  useApplySafetySuspension,
  useLiftSafetySuspension,
  useSetCaseSafety,
} from "@/hooks/useSafetyQueue";
import { incidentKeys } from "@/hooks/useSafetyIncident";
import { useQueryClient } from "@tanstack/react-query";

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h3 className="type-h4">
        {index}. {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <dt className="type-body-xs text-muted-foreground">{label}</dt>
      <dd className="type-body-sm text-right">{value ?? "—"}</dd>
    </div>
  );
}

const yesNo = (value: boolean | null | undefined) =>
  value === true ? "Yes" : value === false ? "No" : "Not recorded";

export function SafetyIncident({ dossier }: { dossier: IncidentDossier }) {
  const qc = useQueryClient();
  const kase = dossier.case;
  const prominent = isProminent(kase.severity);
  const items = relevantItems(dossier.items);
  const outcome = policyOutcome(dossier.policy);
  const handover = handoverState(dossier.booking);
  const agreement = agreementSummary(dossier.agreement);
  const live = activeControls(dossier.controls);
  const holds = heldPayments(dossier.payment_holds);
  const address = addressLines(dossier.space);

  const setSafety = useSetCaseSafety();
  const applyControl = useApplySafetySuspension();
  const lift = useLiftSafetySuspension();

  const [severity, setSeverity] = React.useState<SafetySeverity>(kase.severity ?? "low");
  const [source, setSource] = React.useState<SafetySource>(kase.source ?? "admin_review");
  const [reason, setReason] = React.useState("");

  const refresh = () => void qc.invalidateQueries({ queryKey: incidentKeys.dossier(kase.id) });

  async function saveSeverity() {
    if (reason.trim().length < 2) {
      toast.error("Add a reason", "Severity changes are recorded with the reason you give.");
      return;
    }
    try {
      await setSafety.mutateAsync({
        caseId: kase.id,
        severity,
        source,
        note: reason.trim(),
      });
      setReason("");
      refresh();
      toast.success("Severity recorded", "The change is in the case history and audit trail.");
    } catch (cause) {
      toast.error(
        "We couldn't change the severity",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  }

  async function restrict(scope: "listing" | "booking" | "storage_arrangement" | "account", subjectId: string | null) {
    if (!subjectId) return;
    if (reason.trim().length < 2) {
      toast.error("Add a reason", "A restriction is only recorded with a reason.");
      return;
    }
    try {
      await applyControl.mutateAsync({
        scope,
        subjectId,
        state: "suspended",
        reason: reason.trim(),
        source: kase.source ?? "admin_review",
        caseId: kase.id,
      });
      setReason("");
      refresh();
      toast.success("Restriction applied", "It is recorded and can be lifted.");
    } catch (cause) {
      toast.error(
        "We couldn't apply that",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  }

  async function liftControl(id: string) {
    try {
      await lift.mutateAsync({ suspensionId: id, reason: reason.trim() || "Lifted after review" });
      refresh();
      toast.success("Control lifted");
    } catch (cause) {
      toast.error(
        "We couldn't lift that",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------- summary header */}
      <header
        className={
          prominent
            ? "rounded-xl border-2 border-destructive bg-destructive-soft p-5"
            : "rounded-xl border border-border bg-card p-5"
        }
      >
        <p className="type-h3">{severityHeadline(kase.severity)}</p>
        <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <Row
            label="Potential prohibited / hazardous item"
            value={items[0]?.item_name ?? "No item linked"}
          />
          <Row label="Renter" value={personName(dossier.renter)} />
          <Row label="Host" value={personName(dossier.host)} />
          <Row
            label="Storage location"
            value={address.length > 0 ? address.join(", ") : "No address recorded"}
          />
          <Row label="Booking" value={dossier.booking?.id ?? "No booking linked"} />
          <Row label="Policy result" value={policyResultLabel(dossier.policy)} />
          <Row label="Status" value={kase.status} />
          <Row label="Safety action" value={safetyActionLine(dossier.controls, dossier.payment_holds)} />
        </dl>
      </header>

      {prominent ? <Alert tone="warning" title="Handling guidance">{SAFETY_DANGER_NOTICE}</Alert> : null}

      {/* ------------------------------------------------------ 1 incident */}
      <Section index={1} title="Incident">
        <dl>
          <Row label="Reference" value={kase.reference} />
          <Row label="Severity" value={kase.severity ? SEVERITY_LABEL[kase.severity] : "Not set"} />
          <Row label="Severity reason" value={kase.severity_note ?? "Not recorded"} />
          <Row label="Safety category" value={kase.category} />
          <Row label="Stage" value={kase.stage} />
          <Row label="Detection source" value={kase.source ? SOURCE_LABEL[kase.source] : "Not set"} />
          <Row
            label="Classification basis"
            value={
              kase.source === "item_scan"
                ? "Advisory scanner prompt, reviewed by staff"
                : "Reported by a person and reviewed by staff"
            }
          />
          <Row label="Opened" value={formatDate(kase.created_at)} />
          <Row label="Flagged as safety" value={kase.safety_flagged_at ? formatDate(kase.safety_flagged_at) : "—"} />
          <Row label="Current status" value={kase.status} />
        </dl>
        <p className="type-body-sm text-muted-foreground">{kase.description ?? kase.summary}</p>
      </Section>

      {/* --------------------------------------------------------- 2 items */}
      <Section index={2} title="Item(s)">
        <Alert tone="info" title="How to read this">
          {AI_NOT_PROOF_NOTICE} {POLICY_SOURCE_NOTICE}
        </Alert>
        {items.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">No inventory items are linked to this booking.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const reading = readItem(item, kase.severity);
              return (
                <li key={item.id} className="rounded-lg border border-border p-3">
                  <p className="type-label">{item.item_name}</p>
                  <p className="type-body-xs text-muted-foreground">Item ID {item.id}</p>
                  {reading.advisoryWording ? (
                    <p className="mt-2 type-body-sm text-warning-foreground">
                      A. Advisory detection — {reading.advisoryWording}
                    </p>
                  ) : (
                    <p className="mt-2 type-body-sm text-muted-foreground">
                      A. Advisory detection — none recorded.
                    </p>
                  )}
                  {reading.advisory.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 type-body-xs text-muted-foreground">
                      {reading.advisory.map((flag) => (
                        <li key={flag}>{hazardLabel(flag)}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 type-body-sm">
                    B. Renter declaration — {item.item_name}
                    {item.notes ? ` · ${item.notes}` : ""} · category {item.category ?? "not set"} ·
                    quantity {item.quantity ?? 1}
                  </p>
                  <p className="mt-2 type-body-sm">
                    C. EarnRoom policy classification — {reading.policyCategory ?? "not classified"} ·
                    provenance {reading.policyProvenance ?? "not recorded"} ·
                    renter confirmed {reading.renterConfirmed ? "yes" : "no"}
                    {reading.policyConfirmedAt ? ` on ${formatDate(reading.policyConfirmedAt)}` : ""}
                  </p>
                  <p className="mt-2 type-body-sm">
                    D. Human review note — {reading.humanNote ?? "none recorded"}
                  </p>
                  <p className="mt-2 type-body-xs text-muted-foreground">
                    {item.length_cm && item.width_cm && item.height_cm
                      ? `${item.length_cm}×${item.width_cm}×${item.height_cm} cm · `
                      : ""}
                    {item.ai_detected ? "identified from a photo" : "added by hand"}
                    {item.photo_path ? ` · photo ${item.photo_path}` : ""}
                    {item.photo_analysed_at ? ` · analysed ${formatDate(item.photo_analysed_at)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* -------------------------------------------------------- 3 renter */}
      <Section index={3} title="Renter">
        <dl>
          <Row label="Name" value={personName(dossier.renter)} />
          <Row label="Account reference" value={dossier.renter?.user_id ?? "—"} />
          <Row label="Phone verified" value={yesNo(dossier.renter?.phone_verified ?? null)} />
          <Row label="Member since" value={dossier.renter?.member_since ? formatDate(dossier.renter.member_since) : "—"} />
          <Row label="Storage request" value={dossier.request?.id ?? "—"} />
          <Row label="Booking" value={dossier.booking?.id ?? "—"} />
          <Row
            label="Policy acceptance"
            value={
              dossier.renter && dossier.renter.policy_acceptances.length > 0
                ? `${dossier.renter.policy_acceptances.length} recorded · latest ${formatDate(
                    dossier.renter.policy_acceptances[0]!.accepted_at,
                  )}`
                : "None recorded"
            }
          />
          <Row
            label="Accepted policy version"
            value={dossier.renter?.policy_acceptances[0]?.policy_version_id ?? "—"}
          />
          <Row
            label="Renter declarations"
            value={dossier.renter?.declaration ? "Recorded with the booking" : "Not recorded"}
          />
        </dl>
      </Section>

      {/* ---------------------------------------------------------- 4 host */}
      <Section index={4} title="Host">
        <dl>
          <Row label="Name" value={personName(dossier.host)} />
          <Row label="Account reference" value={dossier.host?.user_id ?? "—"} />
          <Row label="Phone verified" value={yesNo(dossier.host?.phone_verified ?? null)} />
          <Row label="Space" value={dossier.space?.id ?? "—"} />
          <Row label="Listing name" value={dossier.space?.title ?? "—"} />
          <Row label="Listing status" value={dossier.space?.listing_status ?? "—"} />
          <Row
            label="Suitability declarations"
            value={
              dossier.host?.suitability
                ? `authority ${yesNo(dossier.host.suitability.declaration_authority)} · compliance ${yesNo(
                    dossier.host.suitability.declaration_compliance,
                  )} · accuracy ${yesNo(dossier.host.suitability.declaration_accuracy)}`
                : "Not recorded"
            }
          />
          <Row
            label="Declared on"
            value={dossier.host?.suitability?.declared_at ? formatDate(dossier.host.suitability.declared_at) : "—"}
          />
          <Row
            label="Storage agreement acceptance"
            value={
              dossier.agreement?.host_accepted_at
                ? `Accepted ${formatDate(dossier.agreement.host_accepted_at)}`
                : "Not accepted"
            }
          />
        </dl>
      </Section>

      {/* ------------------------------------------------------ 5 location */}
      <Section index={5} title="Storage location">
        <Alert tone="warning" title="Staff only">
          The full address is shown to authorised safety staff here only. Renters and hosts still see
          it only through the existing booking rules.
        </Alert>
        <dl>
          <Row label="Full address" value={address.length > 0 ? address.join(", ") : "Not recorded"} />
          <Row label="Access" value={dossier.space?.access_type ?? "—"} />
          <Row label="Access notes" value={dossier.space?.access_notes ?? "—"} />
          <Row label="Space reference" value={dossier.space?.id ?? "—"} />
          <Row label="Area" value={dossier.space?.approximate_area ?? dossier.space?.postcode_district ?? "—"} />
          <Row
            label="Coordinates"
            value={
              dossier.space?.latitude && dossier.space?.longitude
                ? `${dossier.space.latitude}, ${dossier.space.longitude}`
                : "—"
            }
          />
        </dl>
      </Section>

      {/* ------------------------------------------- 6 booking / request */}
      <Section index={6} title="Booking / storage request">
        <dl>
          <Row label="Storage request ID" value={dossier.request?.id ?? "—"} />
          <Row label="Storage request status" value={dossier.request?.status ?? "—"} />
          <Row label="Booking ID" value={dossier.booking?.id ?? "—"} />
          <Row label="Booking status" value={dossier.booking?.status ?? "—"} />
          <Row label="Space ID" value={dossier.booking?.space_id ?? "—"} />
          <Row label="Listing name" value={dossier.booking?.space_title ?? dossier.space?.title ?? "—"} />
          <Row
            label="Dates"
            value={
              dossier.booking?.start_date
                ? `${formatDate(dossier.booking.start_date)} → ${
                    dossier.booking.end_date ? formatDate(dossier.booking.end_date) : "open"
                  }`
                : "—"
            }
          />
          <Row label="Paid" value={dossier.booking?.paid_at ? formatDate(dossier.booking.paid_at) : "Not recorded"} />
          <Row label="Items finalised" value={handover.itemsFinalised ? "Yes" : "No"} />
          <Row
            label="Renter handover confirmed"
            value={handover.renterConfirmedAt ? formatDate(handover.renterConfirmedAt) : "Not confirmed"}
          />
          <Row
            label="Host handover confirmed"
            value={handover.hostConfirmedAt ? formatDate(handover.hostConfirmedAt) : "Not confirmed"}
          />
          <Row
            label="Storage started"
            value={
              dossier.booking?.activated_at ? formatDate(dossier.booking.activated_at) : "Not started"
            }
          />
          <Row label="Where things stand" value={handover.label} />
        </dl>
      </Section>

      {/* ----------------------------------------------------- 7 agreement */}
      <Section index={7} title="Storage agreement">
        <dl>
          <Row label="Status" value={agreement.status} />
          <Row label="Version" value={agreement.version} />
          <Row
            label="Renter acceptance"
            value={
              dossier.agreement?.renter_accepted_at
                ? `Accepted ${formatDate(dossier.agreement.renter_accepted_at)}`
                : "Not accepted"
            }
          />
          <Row
            label="Host acceptance"
            value={
              dossier.agreement?.host_accepted_at
                ? `Accepted ${formatDate(dossier.agreement.host_accepted_at)}`
                : "Not accepted"
            }
          />
          <Row
            label="Became active"
            value={dossier.agreement?.activated_at ? formatDate(dossier.agreement.activated_at) : "No"}
          />
          <Row label="Re-acceptance required" value={agreement.reacceptanceRequired ? "Yes" : "No"} />
          <Row
            label="Superseded / cancelled"
            value={
              dossier.agreement?.superseded_at
                ? `Superseded ${formatDate(dossier.agreement.superseded_at)}`
                : dossier.agreement?.cancelled_at
                  ? `Cancelled ${formatDate(dossier.agreement.cancelled_at)}`
                  : "No"
            }
          />
        </dl>
      </Section>

      {/* -------------------------------------------------------- 8 policy */}
      <Section index={8} title="Policy result">
        <dl>
          <Row label="Policy result" value={policyResultLabel(dossier.policy)} />
          <Row label="Prohibited" value={outcome.prohibited ? "Yes" : "No"} />
          <Row label="Restricted" value={outcome.restricted ? "Yes" : "No"} />
          <Row label="Identification required" value={outcome.needsIdentification ? "Yes" : "No"} />
          <Row label="Policy version" value={dossier.policy.policy_version ?? "—"} />
          <Row label="Policy version ID" value={dossier.policy.policy_version_id ?? "—"} />
          <Row label="Version accepted by the renter" value={dossier.renter?.policy_acceptances[0]?.policy_version_id ?? "—"} />
          <Row label="Evaluation provenance" value={dossier.policy.screening ? "Recorded at booking" : "Not recorded"} />
        </dl>
        {dossier.policy.rules.length > 0 ? (
          <ul className="space-y-2">
            {dossier.policy.rules.map((rule) => (
              <li key={rule.id} className="rounded-lg border border-border p-3">
                <p className="type-label">
                  {rule.category}
                  {rule.subcategory ? ` · ${rule.subcategory}` : ""} — {rule.decision}
                </p>
                <p className="type-body-xs text-muted-foreground">
                  Rule {rule.rule_key} · ID {rule.id}
                  {rule.internal_reason_code ? ` · ${rule.internal_reason_code}` : ""}
                  {rule.requires_staff_review ? " · staff review required" : ""}
                </p>
                {rule.renter_message ? (
                  <p className="mt-1 type-body-sm text-muted-foreground">{rule.renter_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-muted-foreground">
            No published rule fired for the declared item categories.
          </p>
        )}
      </Section>

      {/* ------------------------------------------------------ 9 evidence */}
      <Section index={9} title="Evidence">
        <p className="type-body-sm">
          Original report: {kase.description ?? kase.summary}
        </p>
        <dl>
          <Row label="Case photos" value={dossier.evidence.case_photos.length} />
          <Row label="Handover photos" value={dossier.evidence.handover_photos.length} />
          <Row label="Condition notes" value={dossier.evidence.condition_notes.length} />
          <Row label="Reported problems" value={dossier.evidence.handover_issues.length} />
        </dl>
        {dossier.evidence.handover_issues.length > 0 ? (
          <ul className="space-y-2">
            {dossier.evidence.handover_issues.map((issue) => (
              <li key={issue.id} className="rounded-lg border border-border p-3">
                <p className="type-label">
                  {issue.category} · {issue.stage} · reported by the {issue.reporter_role ?? "unknown party"}
                </p>
                <p className="type-body-sm text-muted-foreground">{issue.description}</p>
                <p className="type-body-xs text-muted-foreground">{formatDate(issue.created_at)}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {dossier.evidence.condition_notes.length > 0 ? (
          <ul className="space-y-1">
            {dossier.evidence.condition_notes.map((note) => (
              <li key={note.id} className="type-body-sm text-muted-foreground">
                {note.stage} · {note.author_role ?? "unknown"} · {note.body} ({formatDate(note.created_at)})
              </li>
            ))}
          </ul>
        ) : null}
        {dossier.evidence.case_photos.length + dossier.evidence.handover_photos.length > 0 ? (
          <ul className="space-y-1">
            {[...dossier.evidence.case_photos, ...dossier.evidence.handover_photos].map((photo) => (
              <li key={photo.id} className="type-body-xs text-muted-foreground">
                {photo.storage_path}
                {photo.caption ? ` — ${photo.caption}` : ""} ({formatDate(photo.created_at)})
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {/* ------------------------------------------------------ 10 controls */}
      <Section index={10} title="Safety controls">
        {live.length === 0 && holds.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">
            No safety control is currently applied to this listing, booking, storage arrangement or account.
          </p>
        ) : null}
        {dossier.controls.length > 0 ? (
          <ul className="space-y-2">
            {dossier.controls.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="type-label">
                    {SCOPE_LABEL[row.scope]} · {CONTROL_STATE_LABEL[row.state]}
                    {row.lifted_at ? " · lifted" : ""}
                  </p>
                  <p className="type-body-xs text-muted-foreground">
                    {row.reason} · {SOURCE_LABEL[row.source]} · applied by {row.created_by ?? "system"} ·{" "}
                    {formatDate(row.created_at)}
                    {row.lifted_at ? ` · lifted ${formatDate(row.lifted_at)}` : ""}
                  </p>
                </div>
                {row.lifted_at ? null : (
                  <Button variant="secondary" size="sm" disabled={lift.isPending} onClick={() => void liftControl(row.id)}>
                    Lift
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {holds.length > 0 ? (
          <ul className="space-y-1">
            {holds.map((hold) => (
              <li key={hold.id} className="type-body-sm text-muted-foreground">
                Host earnings hold · {hold.period_label ?? "period"} ·{" "}
                {formatPrice(hold.host_entitlement_pence ?? 0)} · {hold.status}
                {hold.blocked_reason ? ` · ${hold.blocked_reason}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={applyControl.isPending || !dossier.space}
            onClick={() => void restrict("listing", dossier.space?.id ?? null)}
          >
            Restrict listing
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={applyControl.isPending || !dossier.booking}
            onClick={() => void restrict("booking", dossier.booking?.id ?? null)}
          >
            Restrict booking
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={applyControl.isPending || !dossier.booking}
            onClick={() => void restrict("storage_arrangement", dossier.booking?.id ?? null)}
          >
            Restrict storage arrangement
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={applyControl.isPending || !dossier.renter?.user_id}
            onClick={() => void restrict("account", dossier.renter?.user_id ?? null)}
          >
            Restrict renter account
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={applyControl.isPending || !dossier.host?.user_id}
            onClick={() => void restrict("account", dossier.host?.user_id ?? null)}
          >
            Restrict host account
          </Button>
        </div>
        <p className="type-body-xs text-muted-foreground">
          A restriction uses the reason written in the review box below and is recorded in the audit trail.
        </p>
      </Section>

      {/* ------------------------------------------------------- 11 history */}
      <Section index={11} title="Event / audit history">
        {dossier.events.length === 0 && dossier.audit.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : null}
        <ul className="space-y-1">
          {dossier.events.map((event) => (
            <li key={event.id} className="type-body-sm text-muted-foreground">
              {formatDate(event.created_at)} · {event.event_type} · {event.actor_role ?? "system"} ·{" "}
              {event.internal_note ?? event.public_message ?? ""}
            </li>
          ))}
          {dossier.audit.map((event) => (
            <li key={event.id} className="type-body-sm text-muted-foreground">
              {formatDate(event.created_at)} · {event.event_type} · {event.subject_type ?? ""}
            </li>
          ))}
        </ul>
      </Section>

      {/* -------------------------------------------------------- 12 review */}
      <Section index={12} title="Review / resolution">
        <Alert tone="info" title="Internal safety case">
          {NO_AUTHORITY_NOTICE}
        </Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Severity" htmlFor="incident-severity">
            <NativeSelect
              id="incident-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as SafetySeverity)}
            >
              {(kase.severity ? [kase.severity, ...allowedSeverityChanges(kase.severity)] : allowedSeverityChanges(null)).map(
                (value) => (
                  <option key={value} value={value}>
                    {SEVERITY_LABEL[value]}
                  </option>
                ),
              )}
            </NativeSelect>
          </Field>
          <Field label="Detection source" htmlFor="incident-source">
            <NativeSelect
              id="incident-source"
              value={source}
              onChange={(event) => setSource(event.target.value as SafetySource)}
            >
              {(Object.keys(SOURCE_LABEL) as SafetySource[]).map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABEL[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field
          label="Staff-only reason / note"
          htmlFor="incident-reason"
          hint="Recorded against the case and the audit trail. Never shown to the renter or host."
        >
          <TextArea
            id="incident-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why the severity is changing, or why a restriction is being applied."
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={setSafety.isPending} onClick={() => void saveSeverity()}>
            Record severity change
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/admin/support/$caseId" params={{ caseId: kase.id }}>
              Case status, messages, resolution and refunds
            </Link>
          </Button>
        </div>
        <dl>
          <Row label="Resolution" value={kase.resolution_code ?? "Not recorded"} />
          <Row label="Resolution summary" value={kase.resolution_summary ?? "—"} />
          <Row
            label="Refunded"
            value={kase.refund_total_pence ? formatPrice(kase.refund_total_pence) : "None"}
          />
          <Row label="Resolved" value={kase.resolved_at ? formatDate(kase.resolved_at) : "Open"} />
        </dl>
      </Section>

      <p className="type-body-xs text-muted-foreground">
        Dossier generated {formatDate(dossier.generated_at)}. Visible to EarnRoom safety staff only.
      </p>
      {prominent ? <Badge variant="destructive">Priority incident</Badge> : null}
    </div>
  );
}
