import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Plus, Boxes, ArrowRight, Search } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionsNeeded } from "@/components/bookings/ActionsNeeded";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { ReviewPrompts } from "@/components/reviews/ReviewPrompts";
import { useAuth } from "@/hooks/useAuth";
import { useActiveInventory, useInventoryItems, useInventorySummary } from "@/hooks/useInventory";
import { formatVolume } from "@/lib/inventory-model";
import { SpacePlannerCard } from "@/components/spaceplanner/photo/SpacePlannerCard";
import { RenterSpaceFitCard } from "@/components/spacefit/RenterSpaceFitCard";
import { renterSpaceFitState } from "@/lib/spacefit-hub";

export const Route = createFileRoute("/_authenticated/renter/")({
  head: () => ({
    meta: [
      { title: "Home — Renting — " + brand.name },
      { name: "description", content: "Your storage at a glance and next steps." },
      { property: "og:title", content: "Home — Renting — " + brand.name },
      { property: "og:description", content: "Your storage at a glance and next steps." },
    ],
  }),
  component: RenterHomePage,
});

const actions = [
  {
    to: "/renter/inventory/photos" as const,
    icon: ScanLine,
    title: "Scan my stuff",
    body: "Upload photos and EarnRoom AI will propose an itemised list you review.",
    cta: "Upload photos",
  },
  {
    to: "/renter/inventory/add" as const,
    icon: Plus,
    title: "Add items manually",
    body: "Tell us what you need to store and we'll estimate the space required.",
    cta: "Build my inventory",
  },
];

function RenterHomePage() {
  const { profile } = useAuth();
  const firstName = profile?.first_name?.trim();

  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const { totals, readiness } = useInventorySummary(items);
  const hasItems = (items?.length ?? 0) > 0;
  const spaceFit = renterSpaceFitState(items);

  return (
    <AppLayout
      mode="renter"
      title={firstName ? `Hi, ${firstName}` : "Hi there"}
      description="What do you need space for?"
    >
      <CoachMark id="renter_dashboard" className="mb-4" />
      <ActionsNeeded audience="renter" />
      <ReviewPrompts audience="renter" />

      <div className="mb-6 grid gap-4">
        <RenterSpaceFitCard state={spaceFit} />
        <SpacePlannerCard mode="renter" />
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {actions.map((action) => (
          <li key={action.title}>
            <Link
              to={action.to}
              className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <action.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="mt-4 type-h3">{action.title}</span>
              <span className="mt-1.5 type-body-sm text-muted-foreground">{action.body}</span>
              <span className="mt-4 flex items-center gap-1.5 type-body-sm font-semibold text-primary">
                {action.cta}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="type-h2">My Stuff</h2>
        <div className="mt-4">
          {hasItems ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <p className="type-h1">{totals.itemCount}</p>
                <div>
                  <p className="type-body-sm text-muted-foreground">items</p>
                  <p className="type-body font-semibold">
                    {formatVolume(totals.storageRequirementM3, { approx: true })} estimated storage
                    requirement
                  </p>
                </div>
                <Badge
                  variant={readiness.level === "ready" ? "success" : "warning"}
                  className="ml-auto"
                >
                  {readiness.label}
                </Badge>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/renter/matches">
                    Find matching spaces
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/renter/inventory">View my stuff</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/renter/inventory/add">Add more items</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <EmptyState
                icon={Boxes}
                title="You haven't added anything yet."
                description="Build a quick inventory and we'll estimate how much space you need."
              />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/renter/inventory/add">Build my inventory</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/renter/search">
                    <Search aria-hidden="true" />
                    Browse storage
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
