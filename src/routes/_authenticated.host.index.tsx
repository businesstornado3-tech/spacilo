import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { ActionsNeeded } from "@/components/bookings/ActionsNeeded";
import { ReviewPrompts } from "@/components/reviews/ReviewPrompts";
import { useAuth } from "@/hooks/useAuth";
import { useHostRequests } from "@/hooks/useStorageRequests";
import { pendingForHost } from "@/lib/storage-requests";
import { formatM3, remainingVolume } from "@/lib/spaces";
import { useMySpaces } from "@/hooks/useMySpaces";
import { HostSpaceFitCard } from "@/components/host/spacefit/HostSpaceFitCard";
import { hostSpaceFitState } from "@/lib/spacefit-hub";

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
  const { data: spacesData, isPending: spacesPending } = useMySpaces();
  const spaces = spacesPending ? null : (spacesData ?? []);
  const spaceFit = hostSpaceFitState(spaces);

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

  const { data: hostRequests } = useHostRequests();
  // Only requests genuinely awaiting a response count — never accepted,
  // declined, withdrawn or expired ones.
  const pendingRequests = pendingForHost(hostRequests ?? []);
  const pendingCount = pendingRequests.length;

  const summary = [
    { label: "Monthly earnings", value: "£0" },
    { label: "Active bookings", value: "0" },
    { label: "Listed spaces", value: String(listed.length) },
    { label: "Estimated free capacity", value: formatM3(capacity) },
    { label: "Pending requests", value: String(pendingCount) },
  ];

  const hasSpaces = (spaces?.length ?? 0) > 0;

  return (
    <AppLayout
      mode="host"
      title={firstName ? `Hi, ${firstName}` : "Hi there"}
      description="Let's put your unused space to work."
    >
      <ActionsNeeded audience="host" />
      <ReviewPrompts audience="host" />

      <div className="mb-6">
        <HostSpaceFitCard state={spaceFit} />
      </div>
      {pendingCount > 0 ? (
        <div className="mb-6 rounded-2xl border border-border bg-accent-soft p-5 shadow-card">
          <p className="type-body font-semibold">
            You have {pendingCount} storage {pendingCount === 1 ? "request" : "requests"} awaiting your
            response.
          </p>
          <Button asChild className="mt-4">
            <Link to="/host/bookings">
              {pendingCount === 1 ? "Review request" : "Review requests"}
            </Link>
          </Button>
        </div>
      ) : null}

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

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
