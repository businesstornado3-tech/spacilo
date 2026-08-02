import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/host/earnings")({
  head: () => ({
    meta: [
      { title: "Earnings — Hosting — " + brand.name },
      { name: "description", content: "Payouts, fees and monthly income from your spaces." },
      { property: "og:title", content: "Earnings — Hosting — " + brand.name },
      { property: "og:description", content: "Payouts, fees and monthly income from your spaces." },
    ],
  }),
  component: HostEarningsPage,
});

function HostEarningsPage() {
  return (
    <AppLayout mode="host" title="Earnings" description="Payouts, fees and monthly income from your spaces.">
      <PagePlaceholder
        title="Not built yet"
        description="This area is scaffolded so navigation works end to end. Functionality arrives in a later step."
        planned={["Monthly earnings", "Payout schedule", "Fees breakdown", "Statements"]}
      />
    </AppLayout>
  );
}
