import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationList } from "@/components/messages/ConversationList";

const description = "Conversations with renters about your spaces.";

export const Route = createFileRoute("/_authenticated/host/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — Hosting — " + brand.name },
      { name: "description", content: description },
      { property: "og:title", content: "Messages — Hosting — " + brand.name },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostMessagesPage,
});

function HostMessagesPage() {
  return (
    <AppLayout mode="host" title="Messages" description={description}>
      <ConversationList audience="host" />
    </AppLayout>
  );
}
