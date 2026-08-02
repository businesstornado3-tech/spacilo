import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/renter/")({
  head: () => ({
    meta: [
      { title: "Home — Renting — " + brand.name },
      { name: "description", content: "Your storage at a glance, nearby spaces and next steps." },
      { property: "og:title", content: "Home — Renting — " + brand.name },
      { property: "og:description", content: "Your storage at a glance, nearby spaces and next steps." },
    ],
  }),
  component: RenterHomePage,
});

function RenterHomePage() {
  return (
    <AppLayout mode="renter" title="Home" description="Your storage at a glance, nearby spaces and next steps.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Nearby spaces", "Active bookings", "Inventory summary", "Suggested matches"]}
      />
    </AppLayout>
  );
}
