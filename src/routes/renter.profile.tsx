import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/renter/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Renting — " + brand.name },
      { name: "description", content: "Your details, verification status and preferences." },
      { property: "og:title", content: "Profile — Renting — " + brand.name },
      { property: "og:description", content: "Your details, verification status and preferences." },
    ],
  }),
  component: RenterProfilePage,
});

function RenterProfilePage() {
  return (
    <AppLayout mode="renter" title="Profile" description="Your details, verification status and preferences.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Personal details", "Verification", "Payment methods", "Switch to hosting"]}
      />
    </AppLayout>
  );
}
