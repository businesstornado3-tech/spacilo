import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ScanLine } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { capabilityIndex } from "@/lib/discovery/linking";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = `${brand.name} tools`;
const description = "Explore EarnRoom tools for belongings, spaces, storage fit and finding published storage nearby.";

export const Route = createFileRoute("/tools")({
  head: ({ matches }) => {
    const base = publicRouteMeta({ title, description, path: "/tools" });
    const isChildPage = matches.some((match) => String(match.routeId) === "/tools/$slug");
    return {
      ...base,
      links: isChildPage ? [] : base.links,
      scripts: [jsonLdScript(itemListJsonLd(capabilityIndex().map((link) => ({ name: link.label, path: link.to })))), jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }]))],
    };
  },
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <p className="type-overline text-muted-foreground">{brand.name} tools</p>
        <h1 className="mt-2 type-h1">Understand your stuff, space and options.</h1>
        <p className="mt-4 max-w-2xl type-body text-muted-foreground">Use the tool that matches the question you have today. AI outputs are estimates and starting points: you stay in control.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {capabilityIndex().map((link) => (
            <Link key={link.to} to={link.to} className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/50 hover:bg-primary-soft">
              <ScanLine className="size-6 text-primary" aria-hidden="true" />
              <div className="mt-4 flex items-center justify-between gap-4"><h2 className="type-h3">{link.label}</h2><ArrowRight className="size-5 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
              <p className="mt-2 type-body-sm text-muted-foreground">{link.reason}</p>
            </Link>
          ))}
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
