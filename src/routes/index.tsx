import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
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
import { FinalCta } from "@/components/home/FinalCta";

const title = `${brand.name} | Neighbourhood Storage Near You`;
const description =
  "Find trusted neighbourhood storage near you, or earn from an unused garage, loft, shed or spare room. Spacilo AI helps estimate what fits. Starting in Portsmouth.";
const url = "https://home-stash-link.lovable.app/";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: brand.name,
          url,
          description,
        }),
      },
    ],
  }),
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
      <FinalCta />
    </MarketingLayout>
  );
}
