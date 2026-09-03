import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { GUIDE_CLUSTERS } from "@/lib/discovery/clusters";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = `${brand.name} guides`;
const description = "Practical guidance for organising belongings, planning storage and making useful space work harder.";

export const Route = createFileRoute("/guides")({
  head: ({ matches }) => {
    const base = publicRouteMeta({ title, description, path: "/guides" });
    const isChildPage = matches.some((match) => String(match.routeId) === "/guides/$slug");
    return {
      ...base,
      links: isChildPage ? [] : base.links,
      scripts: [jsonLdScript(itemListJsonLd(GUIDE_CLUSTERS.map((cluster) => ({ name: cluster.title, path: cluster.path })))), jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }]))],
    };
  },
  component: GuidesPage,
});

function GuidesPage() {
  return <MarketingLayout><PageSection><p className="type-overline text-muted-foreground">{brand.name} guides</p><h1 className="mt-2 type-h1">Useful answers for your next move.</h1><p className="mt-4 max-w-2xl type-body text-muted-foreground">No generic promises. Just reviewed guidance based on what EarnRoom can help you do today.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{GUIDE_CLUSTERS.map((cluster) => <Link key={cluster.id} to={cluster.path} className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/50 hover:bg-primary-soft"><BookOpen className="size-5 text-primary" aria-hidden="true" /><h2 className="mt-4 type-h3">{cluster.title}</h2><p className="mt-2 type-body-sm text-muted-foreground">{cluster.description}</p><span className="mt-5 inline-flex items-center gap-2 type-nav text-primary">Read guide <ArrowRight className="size-4" aria-hidden="true" /></span></Link>)}</div></PageSection></MarketingLayout>;
}
