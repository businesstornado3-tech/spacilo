import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, MapPin, PoundSterling } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PostcodeSearch } from "@/components/form/SearchFields";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${brand.name} — ${brand.propositions.renter}` },
      {
        name: "description",
        content:
          "Find affordable storage in garages, lofts and spare rooms near you, or earn money from space you're not using. A UK peer-to-peer storage marketplace built around trust.",
      },
      { property: "og:title", content: `${brand.name} — ${brand.propositions.renter}` },
      {
        property: "og:description",
        content:
          "Find affordable storage nearby, or earn money from space you're not using.",
      },
    ],
  }),
  component: HomePage,
});

const pillars = [
  {
    icon: MapPin,
    title: brand.propositions.renter,
    body: "Storage in garages, lofts, sheds and spare rooms in your own neighbourhood.",
  },
  {
    icon: PoundSterling,
    title: brand.propositions.host,
    body: "Turn space you're already paying for into a steady monthly income.",
  },
  {
    icon: Sparkles,
    title: brand.propositions.ai,
    body: "Photograph your belongings and get an estimate of the space you'll need.",
  },
  {
    icon: ShieldCheck,
    title: brand.propositions.trust,
    body: "Verified identities, declared belongings, secure payments and private addresses.",
  },
];

function HomePage() {
  return (
    <MarketingLayout>
      <PageSection className="pb-4">
        <Badge variant="subtle">Foundation build · pilot: {brand.pilotAreas[0]}</Badge>
        <h1 className="mt-4 max-w-3xl type-hero">{brand.propositions.renter}</h1>
        <p className="mt-4 max-w-xl type-body text-muted-foreground">
          {brand.name} is a UK peer-to-peer storage marketplace. This build establishes the design
          system, component library, navigation and route structure.
        </p>

        <div className="mt-8 max-w-xl rounded-2xl border border-border bg-card p-5 shadow-card">
          <PostcodeSearch hint="Enter a UK postcode to see how search will work." />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/design-system">View the design system</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/how-it-works">How it works</Link>
          </Button>
        </div>
      </PageSection>

      <PageSection className="pt-6">
        <h2 className="type-h2">What we're building</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 type-h3">{title}</h3>
              <p className="mt-2 type-body-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </PageSection>
    </MarketingLayout>
  );
}
