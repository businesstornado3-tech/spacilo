import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Check, CircleAlert } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { DiscoveryLinkList } from "@/components/discovery/DiscoveryLinkList";
import { capabilityBySlug, type Capability } from "@/lib/discovery/capabilities";
import { linksForCapability } from "@/lib/discovery/linking";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from "@/lib/seo/structured-data";
import { track } from "@/lib/analytics/tracker";

export const Route = createFileRoute("/tools/$slug")({
  loader: ({ params }) => {
    const capability = capabilityBySlug(params.slug);
    if (!capability) throw notFound();
    return { capability };
  },
  head: ({ params, loaderData }) => {
    const capability = loaderData?.capability ?? capabilityBySlug(params.slug);
    if (!capability) return { ...publicRouteMeta({ title: `Tool — ${brand.name}`, description: "EarnRoom tools.", path: `/tools/${params.slug}` }) };
    const path = `/tools/${capability.slug}`;
    return {
      ...publicRouteMeta({ title: `${capability.name} — ${brand.name}`, description: capability.purpose, path }),
      scripts: [jsonLdScript(webPageJsonLd({ name: capability.name, description: capability.purpose, path })), jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }, { name: capability.name, path }]))],
    };
  },
  component: CapabilityPage,
});

function CapabilityPage() {
  const { capability } = Route.useLoaderData();
  React.useEffect(() => { track("capability_viewed", { props: { capability: capability.id } }); }, [capability.id]);
  return <CapabilityContent capability={capability} />;
}

function CapabilityContent({ capability }: { capability: Capability }) {
  return (
    <MarketingLayout>
      <PageSection>
        <p className="type-overline text-muted-foreground">EarnRoom capability</p>
        <h1 className="mt-2 type-h1">{capability.name}</h1>
        <p className="mt-4 max-w-2xl type-body text-muted-foreground">{capability.purpose}</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <section><h2 className="type-h2">The problem it helps with</h2><p className="mt-2 type-body-sm text-muted-foreground">{capability.problem}</p></section>
            <section><h2 className="type-h2">How it works</h2><ol className="mt-3 space-y-3">{capability.howItWorks.map((step, index) => <li key={step} className="flex gap-3 type-body-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground type-label">{index + 1}</span><span>{step}</span></li>)}</ol></section>
            <section><h2 className="type-h2">What you can expect</h2><p className="mt-2 type-body-sm text-muted-foreground">{capability.outcome}</p></section>
          </div>
          <aside className="rounded-2xl border border-border bg-card p-6">
            <h2 className="type-h3">What you provide</h2><ul className="mt-3 space-y-2 type-body-sm text-muted-foreground">{capability.inputs.map((input) => <li key={input} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{input}</li>)}</ul>
            <div className="mt-6 border-t border-border pt-5"><h3 className="type-card-title flex items-center gap-2"><CircleAlert className="size-4 text-primary" aria-hidden="true" />Keep in mind</h3><ul className="mt-3 space-y-2 type-body-xs text-muted-foreground">{capability.limits.map((limit) => <li key={limit}>• {limit}</li>)}</ul></div>
            <Button asChild className="mt-6 w-full"><Link to={capability.cta.to}>{capability.cta.label}<ArrowRight aria-hidden="true" /></Link></Button>
          </aside>
        </div>
        <div className="mt-10"><h2 className="type-h2">A useful next step</h2><div className="mt-4"><DiscoveryLinkList links={linksForCapability(capability.id)} /></div></div>
      </PageSection>
    </MarketingLayout>
  );
}
