import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { hostEntryTarget } from "@/lib/host-entry";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = "List your space — " + brand.name;
const description =
  "Earn from a garage, loft, shed or spare room you're not using. Set your own monthly price, choose what you accept, and pause any time.";

export const Route = createFileRoute("/list-space")({
  head: () => ({
    ...publicRouteMeta({ title, description, path: "/list-space" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "List your space", path: "/list-space" },
        ]),
      ),
    ],
  }),
  component: ListSpacePage,
});

const steps = [
  { title: "Tell us about the space", body: "Type, size and how much of it you're offering." },
  {
    title: "Add photos and details",
    body: "A few clear photos, what it's good for and how renters get in.",
  },
  {
    title: "Set your price and publish",
    body: "You choose the monthly price, and can pause anytime.",
  },
];

function ListSpacePage() {
  const { user } = useAuth();

  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Earn from space you're not using</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">
          Tell us about your garage, loft, shed or spare room and set your own monthly price. It
          takes about five minutes, and we save your progress as you go.
        </p>

        <div className="mt-7">
          <Button asChild size="lg">
            {hostEntryTarget(Boolean(user)).to === "/host/spaces/new" ? (
              <Link to="/host/spaces/new">List my space</Link>
            ) : (
              <Link to="/signup" search={{ mode: "host" }}>
                Get started as a host
              </Link>
            )}
          </Button>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-card"
            >
              <span className="type-body-sm text-muted-foreground">Step {index + 1}</span>
              <h2 className="mt-1 type-h3">{step.title}</h2>
              <p className="mt-2 type-body-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 max-w-prose type-body-sm text-muted-foreground">
          Your full address stays private. Renters only see an approximate area until a booking is
          confirmed.
        </p>
      </PageSection>
    </MarketingLayout>
  );
}
