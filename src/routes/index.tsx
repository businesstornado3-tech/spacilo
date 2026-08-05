import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Hero } from "@/components/home/Hero";
import { SpaceFitStory } from "@/components/home/SpaceFitStory";
import { StorageNearYou } from "@/components/home/StorageNearYou";
import { TwoSidedValue } from "@/components/home/TwoSidedValue";
import { WhyStow } from "@/components/home/WhyStow";
import { HowItWorks } from "@/components/home/HowItWorks";
import { HostCallout } from "@/components/home/HostCallout";
import { LaunchArea } from "@/components/home/LaunchArea";

const title = `${brand.name} | SpaceFit AI Storage Near You`;
const description =
  "Scan your stuff or your spare space with SpaceFit AI. Find neighbourhood storage that actually fits, or earn from an unused garage, loft or spare room. Starting in Portsmouth.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <MarketingLayout>
      <Hero />
      <SpaceFitStory />
      <StorageNearYou />
      <HowItWorks />
      <TwoSidedValue />
      <WhyStow />
      <HostCallout />
      <LaunchArea />
    </MarketingLayout>
  );
}
