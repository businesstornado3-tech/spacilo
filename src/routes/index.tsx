import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { canonicalUrl, publicRouteMeta } from "@/lib/seo/meta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/spaceplanner/HeroSection";
import { SpacePlannerDemo } from "@/components/spaceplanner/SpacePlannerDemo";
import { MarketplaceEntry } from "@/components/home/MarketplaceEntry";
import { StorageNearYou } from "@/components/home/StorageNearYou";
import { SpaceFitStory } from "@/components/home/SpaceFitStory";
import { HowItWorks } from "@/components/home/HowItWorks";
import { BrandStory } from "@/components/home/BrandStory";
import { HostCallout } from "@/components/home/HostCallout";
import { HostAiSection } from "@/components/home/HostAiSection";
import { HostControl } from "@/components/home/HostControl";
import { TrustSection } from "@/components/home/TrustSection";
import { LaunchArea } from "@/components/home/LaunchArea";

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
      <SpacePlannerDemo />
      <MarketplaceEntry />
      <StorageNearYou />
      <SpaceFitStory />
      <HowItWorks />
      <BrandStory />
      <HostCallout />
      <HostAiSection />
      <HostControl />
      <TrustSection />
      <LaunchArea />
    </MarketingLayout>
  );
}
