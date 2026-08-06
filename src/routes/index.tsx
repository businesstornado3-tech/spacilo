import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { canonicalUrl, publicRouteMeta } from "@/lib/seo/meta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Hero } from "@/components/home/Hero";
import { StorageNearYou } from "@/components/home/StorageNearYou";
import { SpaceFitStory } from "@/components/home/SpaceFitStory";
import { HowItWorks } from "@/components/home/HowItWorks";
import { BrandStory } from "@/components/home/BrandStory";
import { HostCallout } from "@/components/home/HostCallout";
import { HostAiSection } from "@/components/home/HostAiSection";
import { HostControl } from "@/components/home/HostControl";
import { TrustSection } from "@/components/home/TrustSection";
import { LaunchArea } from "@/components/home/LaunchArea";

const title = `${brand.name} | Neighbourhood Storage Near You`;
const description =
  "Find trusted neighbourhood storage near you, or earn from an unused garage, loft, shed or spare room. Spacilo AI helps estimate what fits.";

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
      <Hero />
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
