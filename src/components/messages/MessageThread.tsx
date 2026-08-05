/**
 * A message thread, given an already-opened conversation.
 *
 * Used for both booking conversations and pre-booking space enquiries. It
 * renders people's words and nothing else: no automated messages, no exact
 * address, no pricing decisions.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { MAX_MESSAGE_LENGTH, type Conversation } from "@/lib/messages-api";
import { cn } from "@/lib/utils";

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function MessageThread({
  conversation,
  viewerId,
  audience,
  emptyHint,
  isLoading = false,
}: {
  conversation: Conversation | null | undefined;
  viewerId: string | null | undefined;
  audience: "renter" | "host";
  emptyHint?: string;
  isLoading?: boolean;
}) {
  const { data: messages } = useMessages(conversation?.id);
  const send = useSendMessage(conversation ?? null);
  const [draft, setDraft] = React.useState("");

  const other = audience === "renter" ? "host" : "renter";

  const onSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    try {
      await send.mutateAsync(draft);
      setDraft("");
    } catch (cause) {
      toast.error(
        "We couldn't send that message",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <div className="space-y-4">
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
      </ul>

      {!isLoading && (messages?.length ?? 0) === 0 ? (
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
        <Button type="submit" disabled={!draft.trim() || send.isPending || !conversation}>
          {send.isPending ? "Sending…" : "Send message"}
        </Button>
      </form>
    </div>
  );
}
