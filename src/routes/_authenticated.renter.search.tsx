import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/renter/search")({
  head: () => ({
    meta: [
      { title: "Search — Renting — " + brand.name },
      { name: "description", content: "Find storage near you and compare SpaceFit matches." },
      { property: "og:title", content: "Search — Renting — " + brand.name },
      { property: "og:description", content: "Find storage near you and compare SpaceFit matches." },
    ],
  }),
  component: RenterSearchPage,
});

function RenterSearchPage() {
  return (
    <AppLayout mode="renter" title="Search" description="Find storage near you and compare SpaceFit matches.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Postcode search", "Map and list view", "Filters", "SpaceFit ranking"]}
      />
    </AppLayout>
  );
}
