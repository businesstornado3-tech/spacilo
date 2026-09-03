import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { canonicalUrl, publicRouteMeta } from "@/lib/seo/meta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { HeroSection } from "@/components/spaceplanner/HeroSection";
import { SpaceFitEntry } from "@/components/home/SpaceFitEntry";
import { SpacePlannerSection } from "@/components/home/SpacePlannerSection";
import { MarketplaceEntry } from "@/components/home/MarketplaceEntry";
import { SpacePlannerDemo } from "@/components/spaceplanner/SpacePlannerDemo";
import { NearbySpaces } from "@/components/home/NearbySpaces";
import { MeetEarnRoomAI } from "@/components/home/MeetEarnRoomAI";

import { SpaceValueSection } from "@/components/home/SpaceValueSection";
import { WhySpacePlanner } from "@/components/home/WhySpacePlanner";
import { FinalCta } from "@/components/home/FinalCta";

const title = `${brand.name} | AI Storage Planning & Neighbourhood Storage`;
const description =
  "Try EarnRoom AI SpacePlanner free: plan what fits in a garage, loft or spare room in seconds, then find trusted neighbourhood storage near you.";

export const Route = createFileRoute("/")({
  head: () => {
    const base = publicRouteMeta({ title, description, path: "/" });
    return {
      ...base,
      scripts: [],
    };
  },
  component: HomePage,
});

function HomePage() {
  return (
    <MarketingLayout>
      <HeroSection />
      <SpaceFitEntry />
      <SpacePlannerSection />
      <MarketplaceEntry />
      <SpacePlannerDemo />
      <NearbySpaces />
      <MeetEarnRoomAI />
      <SpaceValueSection />
      <WhySpacePlanner />
      <FinalCta />
    </MarketingLayout>
  );
}
