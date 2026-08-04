import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { BookingConversation } from "@/components/messages/BookingConversation";
import { useAuth } from "@/hooks/useAuth";
import { useBooking } from "@/hooks/useBookings";
import { bookingView } from "@/lib/bookings";

const description = "Message the host about this booking.";

export const Route = createFileRoute("/_authenticated/renter/messages/$bookingId")({
  head: () => ({
    meta: [
      { title: "Conversation — Renting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Conversation — Renting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RenterConversationPage,
});

function RenterConversationPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const { data: booking } = useBooking(bookingId);
  const view = booking ? bookingView(booking) : null;

  return (
    <AppLayout
      mode="renter"
      title={view?.spaceTitle ?? "Conversation"}
      description={view ? `${view.period} · messages with your host` : description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/renter/messages">All messages</Link>
        </Button>
      }
    >
      <div className="max-w-2xl">
        <BookingConversation bookingId={bookingId} viewerId={user?.id ?? null} audience="renter" />
        <div className="mt-6">
          <Button asChild variant="secondary" size="sm">
            <Link to="/renter/bookings/$bookingId" params={{ bookingId }}>
              View the booking
            </Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
