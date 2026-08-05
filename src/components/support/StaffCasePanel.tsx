/**
 * Support staff console for a single case (Prompt 18).
 *
 * Every action here is authorised again in the database by
 * `is_support_staff(auth.uid())`, so this panel is a convenience surface, not
 * the security boundary. Refund amounts are validated server-side against the
 * remaining refundable balance under a row lock — the figures shown are read
 * from `support_case_refundable`, never derived in the browser.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import {
  useCaseEvents,
  useCaseMessages,
  useCaseRefundable,
  useSupportAddNote,
  useSupportPostUpdate,
  useSupportRecordResolution,
  useSupportResolveWithRefund,
  useSupportSetStatus,
} from "@/hooks/useSupportCases";
import {
  NON_FINANCIAL_RESOLUTIONS,
  RESOLUTION_LABEL,
  STAFF_STATUS_LABEL,
  isCaseLive,
  messageAttribution,
  paymentKindLabel,
  poundsInputToPence,
  refundAmountProblem,
  type SupportCase,
  type SupportCaseStatus,
  type SupportResolutionCode,
} from "@/lib/support-cases";
import { formatDate, formatPrice } from "@/lib/format";

const WORKING_STATUSES: SupportCaseStatus[] = [
  "open",
  "under_review",
  "waiting_for_reporter",
  "waiting_for_other_party",
];

export function StaffCasePanel({ kase }: { kase: SupportCase }) {
  const live = isCaseLive(kase.status);
  const messages = useCaseMessages(kase.id);
  const events = useCaseEvents(kase.id);
  const refundable = useCaseRefundable(kase.id, live);

  const setStatus = useSupportSetStatus(kase.id);
  const postUpdate = useSupportPostUpdate(kase.id);
  const addNote = useSupportAddNote(kase.id);
  const recordResolution = useSupportRecordResolution(kase.id);
  const resolveWithRefund = useSupportResolveWithRefund(kase.id);

  const [status, setStatusValue] = React.useState<SupportCaseStatus>(kase.status);
  const [update, setUpdate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [resolutionCode, setResolutionCode] = React.useState<SupportResolutionCode>("no_action");
  const [resolutionSummary, setResolutionSummary] = React.useState("");
  const [paymentId, setPaymentId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [refundError, setRefundError] = React.useState<string | null>(null);

  const payments = refundable.data ?? [];
  const selected = payments.find((p) => p.payment_id === paymentId) ?? null;

  function report(cause: unknown, fallback: string) {
    toast.error(cause instanceof Error && cause.message ? cause.message : fallback);
  }

  async function applyStatus() {
    try {
      await setStatus.mutateAsync({
        caseId: kase.id,
        status: status as "open" | "under_review" | "waiting_for_reporter" | "waiting_for_other_party",
        ...(update.trim() ? { message: update.trim() } : {}),
      });
      setUpdate("");
      toast.success("Case updated");
    } catch (cause) {
      report(cause, "We couldn't update the case.");
    }
  }

  async function submitUpdate() {
    if (update.trim().length < 2) return;
    try {
      await postUpdate.mutateAsync({ caseId: kase.id, message: update.trim() });
      setUpdate("");
      toast.success("Update sent to both people");
    } catch (cause) {
      report(cause, "We couldn't send that update.");
    }
  }

  async function submitNote() {
    if (note.trim().length < 2) return;
    try {
      await addNote.mutateAsync({ caseId: kase.id, note: note.trim() });
      setNote("");
      toast.success("Internal note saved");
    } catch (cause) {
      report(cause, "We couldn't save that note.");
    }
  }

  async function submitResolution() {
    if (resolutionSummary.trim().length < 1) {
      toast.error("Add a resolution summary.");
      return;
    }
    try {
      await recordResolution.mutateAsync({
        caseId: kase.id,
        resolutionCode: resolutionCode as
          | "no_action"
          | "information_only"
          | "agreement_reached"
          | "booking_cancelled"
          | "other",
        resolutionSummary: resolutionSummary.trim(),
      });
      toast.success("Case resolved");
    } catch (cause) {
      report(cause, "We couldn't resolve the case.");
    }
  }

  async function submitRefund() {
    setRefundError(null);
    if (!selected) {
      setRefundError("Choose the payment to refund.");
      return;
    }
    const pence = poundsInputToPence(amount);
    const problem = refundAmountProblem(pence, selected.remaining_pence);
    if (problem) {
      setRefundError(problem);
      return;
    }
    if (resolutionSummary.trim().length < 1) {
      setRefundError("Add a resolution summary.");
      return;
    }
    try {
      await resolveWithRefund.mutateAsync({
        caseId: kase.id,
        paymentId: selected.payment_id,
        amountPence: pence as number,
        resolutionSummary: resolutionSummary.trim(),
      });
      setAmount("");
      toast.success("Refund submitted", "The case is resolved and the refund is with Stripe.");
    } catch (cause) {
      setRefundError(
        cause instanceof Error && cause.message ? cause.message : "We couldn't submit that refund.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="type-h5">Case handling</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Current status: {STAFF_STATUS_LABEL[kase.status]}
        </p>

        {live ? (
          <div className="mt-4 space-y-4">
            <Field label="Set status" htmlFor="staff-status">
              <NativeSelect
                id="staff-status"
                value={status}
                onChange={(e) => setStatusValue(e.target.value as SupportCaseStatus)}
              >
                {WORKING_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STAFF_STATUS_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Message to both people (optional)" htmlFor="staff-update">
              <TextArea
                id="staff-update"
                value={update}
                maxLength={4000}
                onChange={(e) => setUpdate(e.target.value)}
                placeholder="Visible to the renter and the host."
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button onClick={applyStatus} disabled={setStatus.isPending}>
                {setStatus.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Update status
              </Button>
              <Button
                variant="outline"
                onClick={submitUpdate}
                disabled={postUpdate.isPending || update.trim().length < 2}
              >
                Send update only
              </Button>
            </div>
          </div>
        ) : (
          <Alert tone="info" title="This case is resolved.">
            Resolved cases stay readable but can no longer be changed.
          </Alert>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="type-h5">Internal notes</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Only support staff can read these. They are never shown to the renter or host.
        </p>
        <ul className="mt-3 space-y-2">
          {(messages.data ?? [])
            .filter((message) => message.visibility === "internal")
            .map((message) => (
              <li key={message.id} className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="type-label text-muted-foreground">{formatDate(message.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap type-body-sm">{message.body}</p>
              </li>
            ))}
        </ul>
        <div className="mt-3 space-y-3">
          <Field label="Add an internal note" htmlFor="staff-note">
            <TextArea
              id="staff-note"
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button variant="outline" onClick={submitNote} disabled={addNote.isPending}>
            Save note
          </Button>
        </div>
      </section>

      {live ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="type-h5">Resolve this case</h3>

          <div className="mt-4 space-y-4">
            <Field label="Resolution summary (shown to both people)" htmlFor="staff-summary" required>
              <TextArea
                id="staff-summary"
                value={resolutionSummary}
                maxLength={4000}
                onChange={(e) => setResolutionSummary(e.target.value)}
              />
            </Field>

            <Field label="Outcome without a refund" htmlFor="staff-resolution">
              <NativeSelect
                id="staff-resolution"
                value={resolutionCode}
                onChange={(e) => setResolutionCode(e.target.value as SupportResolutionCode)}
              >
                {NON_FINANCIAL_RESOLUTIONS.map((value) => (
                  <option key={value} value={value}>
                    {RESOLUTION_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button onClick={submitResolution} disabled={recordResolution.isPending}>
              {recordResolution.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Record resolution
            </Button>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h4 className="type-label">Resolve with a refund</h4>
            {refundable.isLoading ? (
              <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
            {payments.length === 0 && !refundable.isLoading ? (
              <p className="mt-2 type-body-sm text-muted-foreground">
                There is nothing left to refund on this booking.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                <Field label="Payment" htmlFor="staff-payment">
                  <NativeSelect
                    id="staff-payment"
                    value={paymentId}
                    onChange={(e) => setPaymentId(e.target.value)}
                  >
                    <option value="">Choose a payment</option>
                    {payments.map((payment) => (
                      <option key={payment.payment_id} value={payment.payment_id}>
                        {paymentKindLabel(payment.is_extension)} · {payment.period_label} ·{" "}
                        {formatPrice(payment.remaining_pence)} refundable
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                {selected ? (
                  <p className="type-body-sm text-muted-foreground">
                    Paid {formatPrice(selected.paid_pence)} · already refunded{" "}
                    {formatPrice(selected.refunded_pence)} · remaining{" "}
                    {formatPrice(selected.remaining_pence)}
                  </p>
                ) : null}

                <Field label="Refund amount (£)" htmlFor="staff-amount">
                  <TextInput
                    id="staff-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>

                {refundError ? (
                  <p role="alert" className="type-body-sm text-destructive">
                    {refundError}
                  </p>
                ) : null}

                <Button
                  variant="destructive"
                  onClick={submitRefund}
                  disabled={resolveWithRefund.isPending}
                >
                  {resolveWithRefund.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Resolve with refund
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="type-h5">Audit trail</h3>
        <ul className="mt-3 space-y-2">
          {(events.data ?? []).map((event) => (
            <li key={event.id} className="type-body-sm text-muted-foreground">
              {formatDate(event.created_at)} · {event.event_type}
              {event.actor_role ? ` · ${messageAttribution(event.actor_role)}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
