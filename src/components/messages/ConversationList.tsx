/**
 * List of booking conversations for whichever side the viewer is on.
 * Titles come from the booking snapshot, so they never change retrospectively.
 */
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/States";
import { useMyBookings } from "@/hooks/useBookings";
import { useMyConversations } from "@/hooks/useMessages";
import { bookingView } from "@/lib/bookings";
import { lifecycleMeta, lifecycleState } from "@/lib/bookings-lifecycle";

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
            ? "Once you have a booking, you can message the host from the booking page."
            : "Once a renter books one of your spaces, you can message them from the booking."
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((conversation) => {
        const booking = byId.get(conversation.booking_id);
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
              params={{ bookingId: conversation.booking_id }}
              className="block rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {conversation.last_message_at ? (
                <p className="mt-2 type-body-sm text-muted-foreground">
                  Last message{" "}
                  {new Date(conversation.last_message_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
