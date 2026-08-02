import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Hero } from "@/components/home/Hero";
import { TrustStrip } from "@/components/home/TrustStrip";
import { StorageNearYou } from "@/components/home/StorageNearYou";
import { SpaceFitSection } from "@/components/home/SpaceFitSection";
import { RenterJourney } from "@/components/home/RenterJourney";
import { HostSection } from "@/components/home/HostSection";
import { HostControl } from "@/components/home/HostControl";
import { TrustSection } from "@/components/home/TrustSection";
import { TwoSidedCta } from "@/components/home/TwoSidedCta";
import { LaunchArea } from "@/components/home/LaunchArea";
import { FinalCta } from "@/components/home/FinalCta";

const title = `${brand.name} | Storage Space Near You`;
const description =
  "Find convenient storage space near you or earn money from unused space in your home. Starting in Portsmouth.";

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
      <TrustStrip />
      <StorageNearYou />
      <SpaceFitSection />
      <RenterJourney />
      <HostSection />
      <HostControl />
      <TrustSection />
      <TwoSidedCta />
      <LaunchArea />
      <FinalCta />
    </MarketingLayout>
  );
}
