/**
 * A renter's pre-booking enquiry thread about a listing.
 * Nothing here is reserved or charged — it's a conversation.
 */
import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { MessageThread } from "@/components/messages/MessageThread";
import { useAuth } from "@/hooks/useAuth";
import { useConversation } from "@/hooks/useMessages";

const description = "Your question to a host about their space, before any request or booking.";

export const Route = createFileRoute("/_authenticated/renter/messages/enquiry/$conversationId")({
  head: () => ({
    meta: [
      { title: "Enquiry — Renting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Enquiry — Renting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RenterEnquiryPage,
});

function RenterEnquiryPage() {
  const { conversationId } = Route.useParams();
  const { user } = useAuth();
  const { data: conversation, isLoading } = useConversation(conversationId);

  return (
    <AppLayout
      mode="renter"
      title="Question about a space"
      description={description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/renter/messages">All messages</Link>
        </Button>
      }
    >
      <div className="max-w-2xl">
        <MessageThread
          conversation={conversation}
          viewerId={user?.id ?? null}
          audience="renter"
          isLoading={isLoading}
        />
        {conversation ? (
          <div className="mt-6">
            <Button asChild variant="secondary" size="sm">
              <Link to="/spaces/$spaceId" params={{ spaceId: conversation.space_id }}>
                View the listing
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
