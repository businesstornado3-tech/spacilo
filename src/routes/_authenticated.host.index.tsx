import { createFileRoute, Link } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/host/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Hosting — " + brand.name },
      { name: "description", content: "Your spaces, bookings and earnings at a glance." },
      { property: "og:title", content: "Dashboard — Hosting — " + brand.name },
      { property: "og:description", content: "Your spaces, bookings and earnings at a glance." },
    ],
  }),
  component: HostDashboardPage,
});

const summary = [
  { label: "Monthly earnings", value: "£0" },
  { label: "Active bookings", value: "0" },
  { label: "Available spaces", value: "0" },
];

function HostDashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.first_name?.trim();

  return (
    <AppLayout
      mode="host"
      title={firstName ? `Hi, ${firstName}` : "Hi there"}
      description="Let's put your unused space to work."
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 className="type-h3">List my first space</h2>
        <p className="mt-2 type-body-sm text-muted-foreground">
          Garage, spare room, loft, shed or unused space.
        </p>
        <Button asChild size="lg" className="mt-5">
          <Link to="/list-space">List my first space</Link>
        </Button>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {summary.map((item) => (
          <li key={item.label} className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="type-body-sm text-muted-foreground">{item.label}</p>
            <p className="mt-1 type-h2">{item.value}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <EmptyState
          icon={Warehouse}
          title="You haven't listed a space yet."
          description="List your first space and we'll guide you through the process."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/list-space">List my space</Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
