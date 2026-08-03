import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Hero } from "@/components/home/Hero";
import { TwoSidedValue } from "@/components/home/TwoSidedValue";
import { WhyStow } from "@/components/home/WhyStow";
import { HowItWorks } from "@/components/home/HowItWorks";
import { HostCallout } from "@/components/home/HostCallout";
import { LaunchArea } from "@/components/home/LaunchArea";

const title = `${brand.name} | Neighbourhood Storage Space Near You`;
const description =
  "Find storage in unused garages, lofts and spare rooms around your neighbourhood — or list space you're not using and set your own monthly price. Starting in Portsmouth.";

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
      <TwoSidedValue />
      <WhyStow />
      <HowItWorks />
      <HostCallout />
      <LaunchArea />
    </MarketingLayout>
  );
}
