/**
 * The inbox (Prompt 26B, Phase 1).
 *
 * Every number on this screen is server-owned: unread counts, previews and
 * archive state come from `list_my_conversations`, so two devices always agree.
 * Booking titles come from the booking snapshot, so they never change
 * retrospectively, and pre-booking enquiries stay clearly marked as enquiries.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Archive, MessageSquare, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/States";
import { Skeleton } from "@/components/common/Skeletons";
import { TextInput } from "@/components/form/Field";
import {
  useConversationSummaries,
  useSetConversationArchived,
} from "@/hooks/useMessages";
import {
  conversationTitle,
  isEnquiryThread,
  isUnderReview,
  previewText,
  searchConversations,
  sortByLatest,
  type ConversationSummary,
} from "@/lib/messages";
import { cn } from "@/lib/utils";

const cardClass =
  "block rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const dayLabel = (at: string | null) =>
  at
    ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

function Row({
  row,
  audience,
  onArchive,
}: {
  row: ConversationSummary;
  audience: "renter" | "host";
  onArchive: (row: ConversationSummary) => void;
}) {
  const enquiry = isEnquiryThread(row);
  const unread = row.unread_count > 0;

  const link = enquiry ? (
    <Link
      to={
        audience === "renter"
          ? "/renter/messages/enquiry/$conversationId"
          : "/host/messages/enquiry/$conversationId"
      }
      params={{ conversationId: row.id }}
      className={cardClass}
    >
      <RowBody row={row} unread={unread} />
    </Link>
  ) : (
    <Link
      to={audience === "renter" ? "/renter/messages/$bookingId" : "/host/messages/$bookingId"}
      params={{ bookingId: row.booking_id as string }}
      className={cardClass}
    >
      <RowBody row={row} unread={unread} />
    </Link>
  );

  return (
    <li>
      {link}
      <div className="mt-1 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onArchive(row)}
          aria-label={row.archived ? "Move back to inbox" : "Archive this conversation"}
        >
          <Archive className="size-4" aria-hidden="true" />
          {row.archived ? "Move to inbox" : "Archive"}
        </Button>
      </div>
    </li>
  );
}

function RowBody({ row, unread }: { row: ConversationSummary; unread: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("type-h3 truncate", unread && "font-semibold")}>
            {conversationTitle(row)}
          </p>
          <p className="type-body-sm text-muted-foreground">
            {row.counterpart_name} ·{" "}
            {isEnquiryThread(row) ? "Before any request or booking" : "Storage booking"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isUnderReview(row) ? <Badge variant="warning">Under review</Badge> : null}
          {isEnquiryThread(row) ? <Badge variant="neutral">Enquiry</Badge> : null}
          {unread ? (
            <span className="min-w-6 rounded-full bg-primary px-2 py-0.5 text-center type-body-sm font-semibold text-primary-foreground">
              {row.unread_count}
            </span>
          ) : null}
        </div>
      </div>
      <p className={cn("mt-2 type-body-sm", unread ? "text-foreground" : "text-muted-foreground")}>
        {previewText(row)}
      </p>
      {dayLabel(row.last_message_at) ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          Last message {dayLabel(row.last_message_at)}
        </p>
      ) : null}
    </>
  );
}

export function ConversationList({ audience }: { audience: "renter" | "host" }) {
  const [showArchived, setShowArchived] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const { data, isLoading } = useConversationSummaries(showArchived);
  const setArchived = useSetConversationArchived();

  const rows = React.useMemo(
    () => searchConversations(sortByLatest(data ?? []), term),
    [data, term],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <TextInput
            id="conversation-search"
            className="pl-9"
            placeholder="Search by name, listing or message"
            aria-label="Search conversations"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? "Show inbox" : "Show archived"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={MessageSquare}
          title={
            term
              ? "Nothing matches that search"
              : showArchived
                ? "Nothing archived"
                : "No conversations yet"
          }
          description={
            term
              ? "Try a host or renter name, or a word from the message."
              : audience === "renter"
                ? "Ask a host a question from any listing, or message them from a booking."
                : "Renters can message you about a listing before requesting, and from any booking."
          }
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              audience={audience}
              onArchive={(target) =>
                setArchived.mutate({ conversationId: target.id, archived: !target.archived })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
