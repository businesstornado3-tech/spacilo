import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/renter/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Renting — " + brand.name },
      { name: "description", content: "Enquiries, confirmed bookings and past storage." },
      { property: "og:title", content: "Bookings — Renting — " + brand.name },
      { property: "og:description", content: "Enquiries, confirmed bookings and past storage." },
    ],
  }),
  component: RenterBookingsPage,
});

function RenterBookingsPage() {
  return (
    <AppLayout mode="renter" title="Bookings" description="Enquiries, confirmed bookings and past storage.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Booking timeline", "Digital check-in", "Payments", "Check-out"]}
      />
    </AppLayout>
  );
}
