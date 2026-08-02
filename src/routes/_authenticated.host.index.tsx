import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatM3, remainingVolume } from "@/lib/spaces";
import { listMySpaces, type Space } from "@/lib/spaces-api";

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

function HostDashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.first_name?.trim();
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);

  React.useEffect(() => {
    let active = true;
    void listMySpaces()
      .then((rows) => active && setSpaces(rows))
      .catch(() => active && setSpaces([]));
    return () => {
      active = false;
    };
  }, []);

  const listed = (spaces ?? []).filter((s) => s.listing_status === "published");
  const capacity = listed.reduce(
    (total, s) =>
      total +
      (remainingVolume(
        s.estimated_available_volume_m3 === null ? null : Number(s.estimated_available_volume_m3),
        Number(s.reserved_volume_m3),
        Number(s.occupied_volume_m3),
      ) ?? 0),
    0,
  );

  const summary = [
    { label: "Monthly earnings", value: "£0" },
    { label: "Active bookings", value: "0" },
    { label: "Listed spaces", value: String(listed.length) },
    { label: "Estimated free capacity", value: formatM3(capacity) },
  ];

  const hasSpaces = (spaces?.length ?? 0) > 0;

  return (
    <AppLayout
      mode="host"
      title={firstName ? `Hi, ${firstName}` : "Hi there"}
      description="Let's put your unused space to work."
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 className="type-h3">{hasSpaces ? "Add another space" : "List my first space"}</h2>
        <p className="mt-2 type-body-sm text-muted-foreground">
          Garage, spare room, loft, shed or unused space.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/host/spaces/new">
              {hasSpaces ? "List another space" : "List my first space"}
            </Link>
          </Button>
          {hasSpaces ? (
            <Button asChild size="lg" variant="secondary">
              <Link to="/host/spaces">Manage my spaces</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((item) => (
          <li key={item.label} className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="type-body-sm text-muted-foreground">{item.label}</p>
            <p className="mt-1 type-h2">{item.value}</p>
          </li>
        ))}
      </ul>

      {spaces !== null && !hasSpaces ? (
        <div className="mt-10">
          <EmptyState
            icon={Warehouse}
            title="You haven't listed a space yet."
            description="List your first space and we'll guide you through the process."
          />
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link to="/host/spaces/new">List my space</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
