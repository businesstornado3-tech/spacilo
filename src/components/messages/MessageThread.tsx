/**
 * A message thread, given an already-opened conversation.
 *
 * Used for both booking conversations and pre-booking space enquiries. It
 * renders people's words and nothing else: no automated messages, no exact
 * address, no pricing decisions. Reading a thread marks it read on the server,
 * so the unread badge is never a local guess.
 */
import * as React from "react";
import { Flag, ShieldAlert } from "lucide-react";

import { track } from "@/lib/analytics/tracker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { TextArea } from "@/components/form/Field";
import { RadioField } from "@/components/form/Controls";
import { toast } from "@/components/overlay/toast";
import {
  useMarkConversationRead,
  useMessages,
  useReportConversation,
  useSendMessage,
} from "@/hooks/useMessages";
import { MAX_MESSAGE_LENGTH, type Conversation } from "@/lib/messages-api";
import {
  ADDRESS_NOTICE,
  CONVERSATION_REPORT_REASONS,
  MODERATION_NOTICE,
  PRIVACY_NOTICE,
  addressVisibility,
} from "@/lib/messages";
import { cn } from "@/lib/utils";

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function ReportDialog({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>(CONVERSATION_REPORT_REASONS[0].value);
  const [details, setDetails] = React.useState("");
  const report = useReportConversation();

  const submit = async () => {
    try {
      await report.mutateAsync({ conversationId, reason, details });
      track("conversation_reported", { props: { conversation_id: conversationId } });
      setOpen(false);
      setDetails("");
      toast.success(
        "Thanks — we'll take a look",
        "The Spacilo team reviews reported conversations. You can keep using your booking as normal.",
      );
    } catch (cause) {
      toast.error(
        "We couldn't send that report",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag className="size-4" aria-hidden="true" />
        Report conversation
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Report this conversation"
        description="Tell us what's wrong. A person at Spacilo reads every report — nothing is decided automatically."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={report.isPending}>
              {report.isPending ? "Sending…" : "Send report"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {CONVERSATION_REPORT_REASONS.map((option) => (
            <RadioField
              key={option.value}
              name="report-reason"
              id={`report-${option.value}`}
              label={option.label}
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
            />
          ))}
          <TextArea
            id="report-details"
            rows={3}
            maxLength={1000}
            placeholder="Anything else we should know? (optional)"
            aria-label="More detail about this report"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}

export function MessageThread({
  conversation,
  viewerId,
  audience,
  emptyHint,
  isLoading = false,
  onSent,
  bookingStatus,
}: {
  conversation: Conversation | null | undefined;
  viewerId: string | null | undefined;
  audience: "renter" | "host";
  emptyHint?: string;
  isLoading?: boolean;
  /** Fired after a message is stored; used for enquiry analytics. */
  onSent?: () => void;
  /** Drives the address notice only; the address itself is never in a thread. */
  bookingStatus?: string | null;
}) {
  const { data: messages } = useMessages(conversation?.id);
  const send = useSendMessage(conversation ?? null);
  const markRead = useMarkConversationRead();
  const [draft, setDraft] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);
  const readFor = React.useRef<string | null>(null);

  const conversationId = conversation?.id ?? null;
  const count = messages?.length ?? 0;

  // Opening a thread is what marks it read — once per thread, server-side.
  React.useEffect(() => {
    if (!conversationId || readFor.current === conversationId) return;
    readFor.current = conversationId;
    markRead.mutate(conversationId);
    track("conversation_opened", { props: { conversation_id: conversationId } });
  }, [conversationId, markRead]);

  React.useEffect(() => {
    if (count > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count, conversationId]);

  const other = audience === "renter" ? "host" : "renter";
  const moderated =
    conversation && "moderation_status" in conversation
      ? (conversation as { moderation_status?: string }).moderation_status === "under_review"
      : false;

  const onSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    try {
      await send.mutateAsync(draft);
      setDraft("");
      if (conversationId) {
        track("message_sent", { props: { conversation_id: conversationId, audience } });
      }
      onSent?.();
    } catch (cause) {
      toast.error(
        "We couldn't send that message",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-muted p-3 type-body-sm text-muted-foreground">
        {PRIVACY_NOTICE} {ADDRESS_NOTICE[addressVisibility(bookingStatus)]}
      </p>

      {moderated ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 type-body-sm text-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {MODERATION_NOTICE}
        </p>
      ) : null}

      <ul className="space-y-3">
        {(messages ?? []).map((message) => {
          const mine = message.sender_id === viewerId;
          return (
            <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <p className="type-body-sm whitespace-pre-wrap">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 type-body-sm",
                    mine ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {mine ? "You" : message.sender_role === "host" ? "Host" : "Renter"} ·{" "}
                  {timeLabel(message.created_at)}
                </p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>

      {!isLoading && count === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          {emptyHint ??
            `No messages yet. Send the ${other} a note about access, timings or anything else.`}
        </p>
      ) : null}

      <form onSubmit={onSend} className="space-y-3">
        <TextArea
          id={`message-${conversation?.id ?? "new"}`}
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={`Message the ${other}…`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Message the ${other}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!draft.trim() || send.isPending || !conversation}>
            {send.isPending ? "Sending…" : "Send message"}
          </Button>
          {conversationId ? <ReportDialog conversationId={conversationId} /> : null}
        </div>
      </form>
    </div>
  );
}
