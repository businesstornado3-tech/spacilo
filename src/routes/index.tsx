import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { canonicalUrl, publicRouteMeta } from "@/lib/seo/meta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/spaceplanner/HeroSection";
import { TwoSidedValue } from "@/components/home/TwoSidedValue";
import { SpacePlannerDemo } from "@/components/spaceplanner/SpacePlannerDemo";
import { MarketplaceEntry } from "@/components/home/MarketplaceEntry";
import { HostEarnings } from "@/components/home/HostEarnings";
import { WhySpacePlanner } from "@/components/home/WhySpacePlanner";
import { FinalCta } from "@/components/home/FinalCta";


const title = `${brand.name} | AI Storage Planning & Neighbourhood Storage`;
const description =
  "Try Spacilo AI SpacePlanner free: plan what fits in a garage, loft or spare room in seconds, then find trusted neighbourhood storage near you.";

export const Route = createFileRoute("/")({
  head: () => {
    const base = publicRouteMeta({ title, description, path: "/" });
    return {
      ...base,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                name: brand.name,
                url: canonicalUrl("/"),
                description,
              },
              {
                "@type": "Organization",
                name: brand.name,
                url: canonicalUrl("/"),
                areaServed: brand.pilotAreas,
              },
            ],
          }),
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  return (
    <MarketingLayout>
      <HeroSection />
      <AiTransformation />
      <SpacePlannerDemo />
      <WhySpacePlanner />
      <MarketplaceEntry />
      <FinalCta />
    </MarketingLayout>
  );
}
