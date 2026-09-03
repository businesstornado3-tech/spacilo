import * as React from "react";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { DiscoveryLinkList } from "@/components/discovery/DiscoveryLinkList";
import { guideBySlug } from "@/lib/discovery/clusters";
import { linksForCluster } from "@/lib/discovery/linking";
import { faqJsonLd, breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from "@/lib/seo/structured-data";
import { publicRouteMeta } from "@/lib/seo/meta";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => { const guide = guideBySlug(params.slug); if (!guide) throw notFound(); return { guide }; },
  head: ({ params, loaderData }) => {
    const guide = loaderData?.guide ?? guideBySlug(params.slug);
    if (!guide) return { ...publicRouteMeta({ title: `Guide — ${brand.name}`, description: "EarnRoom storage guidance.", path: `/guides/${params.slug}` }) };
    const path = guide.path;
    return { ...publicRouteMeta({ title: `${guide.title} — ${brand.name}`, description: guide.description, path }), scripts: [jsonLdScript(webPageJsonLd({ name: guide.title, description: guide.description, path })), ...(guide.faq?.length ? [jsonLdScript(faqJsonLd(guide.faq))] : []), jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: guide.title, path }]))] };
  },
  component: GuidePage,
});

function GuidePage() {
  const { guide } = Route.useLoaderData();
  return <MarketingLayout><PageSection><p className="type-overline text-muted-foreground">EarnRoom guide</p><h1 className="mt-2 max-w-3xl type-h1">{guide.title}</h1><p className="mt-4 max-w-2xl type-body text-muted-foreground">{guide.description}</p><article className="mt-10 max-w-3xl space-y-8">{(guide.sections ?? []).map((section) => <section key={section.heading}><h2 className="type-h2">{section.heading}</h2><p className="mt-2 type-body text-muted-foreground">{section.body}</p></section>)}</article>{guide.faq?.length ? <section className="mt-10 max-w-3xl"><h2 className="type-h2">Questions people ask</h2><div className="mt-4 space-y-4">{guide.faq.map((entry) => <div key={entry.question} className="rounded-xl border border-border bg-card p-4"><h3 className="type-card-title">{entry.question}</h3><p className="mt-2 type-body-sm text-muted-foreground">{entry.answer}</p></div>)}</div></section> : null}<section className="mt-10 max-w-3xl"><h2 className="type-h2">Keep going</h2><div className="mt-4"><DiscoveryLinkList links={linksForCluster(guide)} /></div><Button asChild variant="secondary" className="mt-5"><Link to="/discover">Explore other paths <ArrowRight aria-hidden="true" /></Link></Button></section></PageSection></MarketingLayout>;
}
