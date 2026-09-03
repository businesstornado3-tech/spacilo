import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, House, Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { canonicalUrl, publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript, webPageJsonLd } from "@/lib/seo/structured-data";

const title = `About ${brand.name}`;
const description = `${brand.name} is a UK marketplace connecting people who need storage with neighbours who have space to spare, supported by practical AI tools.`;

export const Route = createFileRoute("/about")({
  head: () => ({
    ...publicRouteMeta({ title, description, path: "/about" }),
    scripts: [
      jsonLdScript(
        webPageJsonLd({ name: title, description, path: "/about" }),
      ),
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: title,
        url: canonicalUrl("/about"),
        isPartOf: { "@type": "WebSite", name: brand.name, url: canonicalUrl("/") },
        about: { "@type": "Organization", name: brand.name, url: canonicalUrl("/") },
      }),
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: title, path: "/about" },
        ]),
      ),
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <p className="type-overline text-muted-foreground">About {brand.name}</p>
        <h1 className="mt-2 max-w-3xl type-h1">A clearer way to use the space around you.</h1>
        <p className="mt-4 max-w-2xl type-body text-muted-foreground">
          {brand.name} is a UK marketplace for storage between people. Renters can find a
          suitable space nearby, while Hosts can list space they are not using. Availability and
          suitability depend on the individual space and location.
        </p>
      </PageSection>

      <PageSection className="pt-0">
        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-6">
            <House className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 type-h3">For renters</h2>
            <p className="mt-2 type-body-sm text-muted-foreground">
              Find published storage in garages, lofts, sheds and spare rooms, then review the
              details before making a request.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <Boxes className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 type-h3">For Hosts</h2>
            <p className="mt-2 type-body-sm text-muted-foreground">
              Make useful space available to people nearby. EarnRoom provides listing and booking
              tools; any earning depends on the space, price and completed bookings.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 type-h3">EarnRoom AI</h2>
            <p className="mt-2 type-body-sm text-muted-foreground">
              SpacePlanner, Item Scanner, Space Scanner, Space Estimate and Location Search help
              people understand belongings, space and available options. AI outputs are estimates
              for review, not guarantees.
            </p>
          </section>
        </div>
      </PageSection>

      <PageSection className="pt-0">
        <div className="max-w-3xl space-y-5">
          <h2 className="type-h2">How the marketplace works</h2>
          <p className="type-body text-muted-foreground">
            A renter starts with what they need to store and can use EarnRoom AI to organise a
            list, estimate space and think through fit. They can then search published spaces by
            location and review a listing before requesting or booking.
          </p>
          <p className="type-body text-muted-foreground">
            A Host describes an available space, reviews the listing details and decides whether to
            accept requests. EarnRoom supports the steps between discovery, booking and handover;
            people remain responsible for checking that the arrangement suits them.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link to="/discover">
                Explore EarnRoom <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
