import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Search } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { DiscoveryLinkList } from "@/components/discovery/DiscoveryLinkList";
import { capabilityIndex } from "@/lib/discovery/linking";
import { guideBySlug, GUIDE_CLUSTERS } from "@/lib/discovery/clusters";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript, webPageJsonLd } from "@/lib/seo/structured-data";
import { track } from "@/lib/analytics/tracker";

const title = `Find your next step — ${brand.name}`;
const description = "Start with what you are trying to do: organise belongings, understand a space, plan a fit, or find storage nearby.";

export const Route = createFileRoute("/discover")({
  head: () => ({
    ...publicRouteMeta({ title, description, path: "/discover" }),
    scripts: [
      jsonLdScript(webPageJsonLd({ name: title, description, path: "/discover" })),
      jsonLdScript(itemListJsonLd(capabilityIndex().map((link) => ({ name: link.label, path: link.to })))),
      jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Discovery", path: "/discover" }])),
    ],
  }),
  component: DiscoveryPage,
});

function DiscoveryPage() {
  React.useEffect(() => {
    track("discovery_started", { props: { entry: "index" } });
  }, []);

  const capabilities = capabilityIndex();
  return (
    <MarketingLayout>
      <PageSection>
        <p className="type-overline text-muted-foreground">{brand.name} discovery</p>
        <h1 className="mt-2 type-h1">What are you trying to do?</h1>
        <p className="mt-4 max-w-2xl type-body text-muted-foreground">Choose the outcome that sounds most like your next step. EarnRoom keeps the route factual and lets you review every estimate or suggestion.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {capabilities.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => track("discovery_resolved", { props: { destination: link.to } })} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary-soft">
              <div className="flex items-start justify-between gap-4"><h2 className="type-h3">{link.label}</h2><ArrowRight className="size-5 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
              <p className="mt-2 type-body-sm text-muted-foreground">{link.reason}</p>
            </Link>
          ))}
        </div>
      </PageSection>
      <PageSection className="pt-0">
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-3"><Compass className="size-5 text-primary" aria-hidden="true" /><h2 className="type-h2">Explore by situation</h2></div>
          <p className="mt-2 type-body-sm text-muted-foreground">Practical guides for moving, organising, making more of a space and finding a sensible next step.</p>
          <div className="mt-5"><DiscoveryLinkList links={GUIDE_CLUSTERS.slice(0, 4).map((cluster) => ({ label: cluster.title, to: cluster.path, reason: cluster.question }))} /></div>
          <div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link to="/search"><Search aria-hidden="true" />Find storage</Link></Button><Button asChild variant="secondary"><Link to="/how-it-works">How it works</Link></Button></div>
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
