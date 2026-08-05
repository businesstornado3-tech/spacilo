/**
 * Participant view of a support case (Prompt 18).
 *
 * Renter and host see the same participant-visible record: the original
 * report, both people's updates, participant evidence and any support update
 * or resolution. Internal support notes are withheld by RLS and filtered again
 * here so a mapping mistake cannot leak one.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import {
  useAddCaseMessage,
  useCaseEvidence,
  useCaseMessages,
  useUploadCaseEvidence,
} from "@/hooks/useSupportCases";
import { signedCaseEvidenceUrls } from "@/lib/support-cases-api";
import {
  CASE_CATEGORY_LABEL,
  CASE_STAGE_LABEL,
  RESOLUTION_LABEL,
  awaitingViewer,
  isCaseLive,
  messageAttribution,
  participantVisibleMessages,
  reporterLabel,
  statusHelpText,
  statusLabel,
  type CaseParty,
  type SupportCase,
} from "@/lib/support-cases";
import { formatDate, formatPrice } from "@/lib/format";

export function SupportCaseView({
  kase,
  viewerId,
  role,
}: {
  kase: SupportCase;
  viewerId: string | null;
  role: CaseParty | null;
}) {
  const messagesQuery = useCaseMessages(kase.id);
  const evidenceQuery = useCaseEvidence(kase.id);
  const addMessage = useAddCaseMessage(kase.id);
  const upload = useUploadCaseEvidence(kase.id);

  const [body, setBody] = React.useState("");
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const evidence = React.useMemo(() => evidenceQuery.data ?? [], [evidenceQuery.data]);

  React.useEffect(() => {
    if (evidence.length === 0) return;
    let active = true;
    // Signed URLs are minted only when there is something to show.
    void signedCaseEvidenceUrls(evidence.map((item) => item.storage_path)).then((map) => {
      if (active) setUrls(map);
    });
    return () => {
      active = false;
    };
  }, [evidence]);

  const reporter = kase.opened_by_user_id === viewerId;
  const live = isCaseLive(kase.status);
  const messages = participantVisibleMessages(messagesQuery.data ?? []);

  async function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length < 2) return;
    try {
      await addMessage.mutateAsync({ caseId: kase.id, body });
      setBody("");
      toast.success("Update added");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We couldn't add that update.");
    }
  }

  async function addPhoto(file: File) {
    if (!role) return;
    try {
      await upload.mutateAsync({ caseId: kase.id, bookingId: kase.booking_id, role, file });
      toast.success("Photo added");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That file couldn't be uploaded.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="type-label text-muted-foreground">Support case</p>
            <h2 className="type-h4">{kase.reference}</h2>
          </div>
          <Badge variant="secondary">{statusLabel(kase.status, reporter)}</Badge>
        </div>
        <p className="mt-3 type-body-sm text-muted-foreground">
          {statusHelpText(kase, viewerId)}
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">Issue</dt>
            <dd className="type-body-sm">{CASE_CATEGORY_LABEL[kase.category]}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">When</dt>
            <dd className="type-body-sm">{CASE_STAGE_LABEL[kase.stage]}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Reported</dt>
            <dd className="type-body-sm">
              {reporterLabel(kase, viewerId)} · {formatDate(kase.created_at)}
            </dd>
          </div>
          {kase.linked_handover_issue_id ? (
            <div>
              <dt className="type-label text-muted-foreground">Related handover issue</dt>
              <dd className="type-body-sm">Linked — the original record is unchanged.</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <p className="type-label">{kase.summary}</p>
          <p className="mt-1 whitespace-pre-wrap type-body-sm text-muted-foreground">
            {kase.description}
          </p>
        </div>
      </section>

      {awaitingViewer(kase, viewerId) ? (
        <Alert tone="warning" title="Support is waiting for your response.">
          Add the information below and we'll pick the case back up.
        </Alert>
      ) : null}

      {kase.resolution_code ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="type-h5">Resolution</h3>
          <p className="mt-1 type-body-sm">{RESOLUTION_LABEL[kase.resolution_code]}</p>
          {kase.resolution_summary ? (
            <p className="mt-2 whitespace-pre-wrap type-body-sm text-muted-foreground">
              {kase.resolution_summary}
            </p>
          ) : null}
          {kase.financially_resolved && kase.refund_total_pence > 0 ? (
            <p className="mt-2 type-body-sm">
              Refund of {formatPrice(kase.refund_total_pence)} recorded against the renter's payment.
            </p>
          ) : null}
          {kase.resolved_at ? (
            <p className="mt-2 type-body-sm text-muted-foreground">
              Resolved {formatDate(kase.resolved_at)}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="type-h5">Updates</h3>
        {messagesQuery.isLoading ? (
          <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : null}
        {messages.length === 0 && !messagesQuery.isLoading ? (
          <p className="mt-2 type-body-sm text-muted-foreground">No updates yet.</p>
        ) : null}
        <ul className="mt-3 space-y-3">
          {messages.map((message) => (
            <li key={message.id} className="rounded-xl border border-border p-3">
              <p className="type-label text-muted-foreground">
                {messageAttribution(message.author_role)} · {formatDate(message.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap type-body-sm">{message.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="type-h5">Evidence</h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Photos are provided by the renter and host as a record. Nothing here is verified by us.
        </p>
        {evidence.length === 0 ? (
          <p className="mt-2 type-body-sm text-muted-foreground">No photos added to this case.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {evidence.map((item) => (
              <li key={item.id} className="space-y-1">
                {urls[item.storage_path] ? (
                  <img
                    src={urls[item.storage_path]}
                    alt={item.caption ?? `Case photo added by the ${item.uploaded_by_role}`}
                    className="aspect-square w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
                )}
                <p className="type-body-sm text-muted-foreground">
                  {messageAttribution(item.uploaded_by_role)} · {formatDate(item.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {live && role ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="type-h5">{reporter ? "Add information" : "Add your response"}</h3>
          <form onSubmit={submitMessage} className="mt-3 space-y-3">
            <Field label="Your update" htmlFor="case-reply">
              <TextArea
                id="case-reply"
                value={body}
                maxLength={4000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add anything that helps support understand what happened."
              />
            </Field>
            <Field label="Add photos" htmlFor="case-reply-photo">
              <input
                id="case-reply-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="type-body-sm"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void addPhoto(file);
                  e.target.value = "";
                }}
              />
            </Field>
            <Button type="submit" disabled={addMessage.isPending || body.trim().length < 2}>
              {addMessage.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Add update
            </Button>
          </form>
        </section>
      ) : (
        <p className="type-body-sm text-muted-foreground">
          This case is no longer accepting participant updates.
        </p>
      )}
    </div>
  );
}
