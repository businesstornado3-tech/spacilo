/**
 * The message thread for one booking.
 *
 * Both sides read and write the same conversation; RLS keeps everyone else
 * out. Nothing is auto-generated — the exact address is never posted here, it
 * stays on the booking page and only after payment.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/form/Field";
import { toast } from "@/components/overlay/toast";
import { useBookingConversation, useMessages, useSendMessage } from "@/hooks/useMessages";
import { MAX_MESSAGE_LENGTH } from "@/lib/messages-api";
import { cn } from "@/lib/utils";

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function BookingConversation({
  bookingId,
  viewerId,
  audience,
}: {
  bookingId: string;
  viewerId: string | null | undefined;
  audience: "renter" | "host";
}) {
  const { data: conversation, isLoading, error } = useBookingConversation(bookingId);
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

  if (error) {
    return (
      <p className="type-body-sm text-muted-foreground">
        We couldn&apos;t open this conversation. It may belong to another account.
      </p>
    );
  }

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
          No messages yet. Send the {other} a note about access, timings or anything else about
          this booking.
        </p>
      ) : null}

      <form onSubmit={onSend} className="space-y-3">
        <TextArea
          id={`message-${bookingId}`}
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
