import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/renter/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Renting — " + brand.name },
      { name: "description", content: "Conversations with hosts about their spaces." },
      { property: "og:title", content: "Messages — Renting — " + brand.name },
      { property: "og:description", content: "Conversations with hosts about their spaces." },
    ],
  }),
  component: RenterMessagesPage,
});

function RenterMessagesPage() {
  return (
    <AppLayout mode="renter" title="Messages" description="Conversations with hosts about their spaces.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Threads", "Booking context", "Attachments"]}
      />
    </AppLayout>
  );
}
