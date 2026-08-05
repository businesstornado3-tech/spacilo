import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — " + brand.name },
      { name: "description", content: "A simple, guided journey for both renters and hosts, from first search to check-out." },
      { property: "og:title", content: "How It Works — " + brand.name },
      { property: "og:description", content: "A simple, guided journey for both renters and hosts, from first search to check-out." },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">How Spacilo works</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">A simple, guided journey for both renters and hosts, from first search to check-out.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Renter journey", "Host journey", "Digital check-in and check-out", "Payments and fees", "Frequently asked questions"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
