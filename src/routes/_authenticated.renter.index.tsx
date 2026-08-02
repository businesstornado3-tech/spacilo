import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Search, Boxes } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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
    to: "/renter/search" as const,
    icon: ScanLine,
    title: "Scan my stuff",
    body: "Use SpaceFit AI to estimate what you need.",
    note: "Coming soon",
  },
  {
    to: "/renter/search" as const,
    icon: Search,
    title: "Search storage",
    body: "Find spaces near you.",
  },
];

function RenterHomePage() {
  const { profile } = useAuth();
  const firstName = profile?.first_name?.trim();

  return (
    <AppLayout
      mode="renter"
      title={firstName ? `Hi, ${firstName}` : "Hi there"}
      description="What do you need space for?"
    >
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
              <span className="mt-4 flex items-center gap-2 type-h3">
                {action.title}
                {action.note ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">
                    {action.note}
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 type-body-sm text-muted-foreground">{action.body}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="type-h2">Your storage</h2>
        <div className="mt-4">
          <EmptyState
            icon={Boxes}
            title="No bookings yet"
            description="When you book storage, you'll see it here."
          />
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link to="/renter/search">Find storage</Link>
            </Button>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
