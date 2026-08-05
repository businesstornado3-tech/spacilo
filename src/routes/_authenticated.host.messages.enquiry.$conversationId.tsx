/**
 * A host's view of a renter's pre-booking enquiry about one of their spaces.
 */
import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { MessageThread } from "@/components/messages/MessageThread";
import { useAuth } from "@/hooks/useAuth";
import { useConversation } from "@/hooks/useMessages";

const description = "A renter's question about your space, before any request or booking.";

export const Route = createFileRoute("/_authenticated/host/messages/enquiry/$conversationId")({
  head: () => ({
    meta: [
      { title: "Enquiry — Hosting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Enquiry — Hosting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostEnquiryPage,
});

function HostEnquiryPage() {
  const { conversationId } = Route.useParams();
  const { user } = useAuth();
  const { data: conversation, isLoading } = useConversation(conversationId);

  return (
    <AppLayout
      mode="host"
      title="Question about your space"
      description={description}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/host/messages">All messages</Link>
        </Button>
      }
    >
      <div className="max-w-2xl">
        <MessageThread
          conversation={conversation}
          viewerId={user?.id ?? null}
          audience="host"
          isLoading={isLoading}
          emptyHint="No messages yet. Answering questions quickly helps renters decide."
        />
        {conversation ? (
          <div className="mt-6">
            <Button asChild variant="secondary" size="sm">
              <Link to="/host/spaces/$spaceId/edit" params={{ spaceId: conversation.space_id }}>
                View the listing
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
