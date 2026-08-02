import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/host/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Hosting — " + brand.name },
      { name: "description", content: "Your spaces, enquiries and earnings at a glance." },
      { property: "og:title", content: "Dashboard — Hosting — " + brand.name },
      { property: "og:description", content: "Your spaces, enquiries and earnings at a glance." },
    ],
  }),
  component: HostDashboardPage,
});

function HostDashboardPage() {
  return (
    <AppLayout mode="host" title="Dashboard" description="Your spaces, enquiries and earnings at a glance.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Performance summary", "New enquiries", "Occupancy", "Payout status"]}
      />
    </AppLayout>
  );
}
