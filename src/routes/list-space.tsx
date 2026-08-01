import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/list-space")({
  head: () => ({
    meta: [
      { title: "List Your Space — " + brand.name },
      { name: "description", content: "Tell us about your garage, loft, shed or spare room and set your own monthly price." },
      { property: "og:title", content: "List Your Space — " + brand.name },
      { property: "og:description", content: "Tell us about your garage, loft, shed or spare room and set your own monthly price." },
    ],
  }),
  component: ListSpacePage,
});

function ListSpacePage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Earn from space you're not using</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">Tell us about your garage, loft, shed or spare room and set your own monthly price.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Space details and photos", "Pricing guidance", "Availability and access rules", "Space verification", "Payout setup"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
