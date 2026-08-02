import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/host/spaces")({
  head: () => ({
    meta: [
      { title: "My Spaces — Hosting — " + brand.name },
      { name: "description", content: "Manage the spaces you list and their availability." },
      { property: "og:title", content: "My Spaces — Hosting — " + brand.name },
      { property: "og:description", content: "Manage the spaces you list and their availability." },
    ],
  }),
  component: HostSpacesPage,
});

function HostSpacesPage() {
  return (
    <AppLayout mode="host" title="My Spaces" description="Manage the spaces you list and their availability.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Listing management", "Photos", "Pricing", "Space verification"]}
      />
    </AppLayout>
  );
}
