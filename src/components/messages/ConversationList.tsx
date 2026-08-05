/**
 * List of conversations for whichever side the viewer is on.
 * Booking titles come from the booking snapshot, so they never change
 * retrospectively. Pre-booking enquiries are shown separately and clearly.
 */
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/States";
import { useMyBookings } from "@/hooks/useBookings";
import { useMyConversations } from "@/hooks/useMessages";
import { bookingView } from "@/lib/bookings";
import { lifecycleMeta, lifecycleState } from "@/lib/bookings-lifecycle";

const cardClass =
  "block rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function LastMessage({ at }: { at: string | null }) {
  if (!at) return null;
  return (
    <p className="mt-2 type-body-sm text-muted-foreground">
      Last message{" "}
      {new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
    </p>
  );
}

export function ConversationList({ audience }: { audience: "renter" | "host" }) {
  const { data: conversations } = useMyConversations();
  const { data: bookings } = useMyBookings();
  const byId = new Map((bookings ?? []).map((booking) => [booking.id, booking]));
  const rows = conversations ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description={
          audience === "renter"
            ? "Ask a host a question from any listing, or message them from a booking."
            : "Renters can message you about a listing before requesting, and from any booking."
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((conversation) => {
        if (conversation.booking_id === null) {
          return (
            <li key={conversation.id}>
              <Link
                to={
                  audience === "renter"
                    ? "/renter/messages/enquiry/$conversationId"
                    : "/host/messages/enquiry/$conversationId"
                }
                params={{ conversationId: conversation.id }}
                className={cardClass}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="type-h3 truncate">Question about a space</p>
                    <p className="type-body-sm text-muted-foreground">
                      Before any request or booking
                    </p>
                  </div>
                  <Badge variant="neutral">Enquiry</Badge>
                </div>
                <LastMessage at={conversation.last_message_at} />
              </Link>
            </li>
          );
        }

        const bookingId = conversation.booking_id;
        const booking = byId.get(bookingId);
        const view = booking ? bookingView(booking) : null;
        const meta = booking ? lifecycleMeta(lifecycleState(booking)) : null;
        return (
          <li key={conversation.id}>
            <Link
              to={
                audience === "renter"
                  ? "/renter/messages/$bookingId"
                  : "/host/messages/$bookingId"
              }
              params={{ bookingId }}
              className={cardClass}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-h3 truncate">{view?.spaceTitle ?? "Booking"}</p>
                  <p className="type-body-sm text-muted-foreground">
                    {view?.period ?? "Storage booking"}
                  </p>
                </div>
                {meta ? <Badge variant={meta.tone}>{meta.label}</Badge> : null}
              </div>
              <LastMessage at={conversation.last_message_at} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
