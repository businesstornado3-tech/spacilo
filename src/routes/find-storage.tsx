import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/find-storage")({
  head: () => ({
    meta: [
      { title: "Find Storage — " + brand.name },
      { name: "description", content: "Search verified garages, lofts, sheds and spare rooms near your postcode, filtered by size, price and access." },
      { property: "og:title", content: "Find Storage — " + brand.name },
      { property: "og:description", content: "Search verified garages, lofts, sheds and spare rooms near your postcode, filtered by size, price and access." },
    ],
  }),
  component: FindStoragePage,
});

function FindStoragePage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Search storage near you</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">Search verified garages, lofts, sheds and spare rooms near your postcode, filtered by size, price and access.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Postcode and radius search", "Map and list results", "SpaceFit matching", "Filters for price, size and features", "Saved searches"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
