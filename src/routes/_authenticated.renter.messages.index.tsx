import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationList } from "@/components/messages/ConversationList";

const description = "Conversations with hosts about their spaces.";

export const Route = createFileRoute("/_authenticated/renter/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — Renting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Messages — Renting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RenterMessagesPage,
});

function RenterMessagesPage() {
  return (
    <AppLayout mode="renter" title="Messages" description={description}>
      <ConversationList audience="renter" />
    </AppLayout>
  );
}
