import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { BookingConversation } from "@/components/messages/BookingConversation";
import { useAuth } from "@/hooks/useAuth";
import { useBooking } from "@/hooks/useBookings";
import { bookingView } from "@/lib/bookings";

const description = "Message the renter about this booking.";

export const Route = createFileRoute("/_authenticated/host/messages/$bookingId")({
  head: () => ({
    meta: [
      { title: "Conversation — Hosting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Conversation — Hosting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostConversationPage,
});

function HostConversationPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const { data: booking } = useBooking(bookingId);
  const view = booking ? bookingView(booking) : null;

  return (
    <AppLayout
      mode="host"
      title={view?.spaceTitle ?? "Conversation"}
      description={view ? `${view.period} · messages with your renter` : description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/host/messages">All messages</Link>
        </Button>
      }
    >
      <div className="max-w-2xl">
        <BookingConversation bookingId={bookingId} viewerId={user?.id ?? null} audience="host" />
        <div className="mt-6">
          <Button asChild variant="secondary" size="sm">
            <Link to="/host/bookings">All bookings</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
