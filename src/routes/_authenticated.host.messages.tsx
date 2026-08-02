import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/host/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Hosting — " + brand.name },
      { name: "description", content: "Conversations with renters enquiring about your spaces." },
      { property: "og:title", content: "Messages — Hosting — " + brand.name },
      { property: "og:description", content: "Conversations with renters enquiring about your spaces." },
    ],
  }),
  component: HostMessagesPage,
});

function HostMessagesPage() {
  return (
    <AppLayout mode="host" title="Messages" description="Conversations with renters enquiring about your spaces.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Threads", "Booking context", "Response times"]}
      />
    </AppLayout>
  );
}
