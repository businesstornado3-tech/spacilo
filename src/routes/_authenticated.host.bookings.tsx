import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/host/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Hosting — " + brand.name },
      { name: "description", content: "Requests, active bookings and completed stays." },
      { property: "og:title", content: "Bookings — Hosting — " + brand.name },
      { property: "og:description", content: "Requests, active bookings and completed stays." },
    ],
  }),
  component: HostBookingsPage,
});

function HostBookingsPage() {
  return (
    <AppLayout mode="host" title="Bookings" description="Requests, active bookings and completed stays.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Accept or decline requests", "Declared belongings", "Check-in and check-out", "Reviews"]}
      />
    </AppLayout>
  );
}
