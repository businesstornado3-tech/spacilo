import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Safety — " + brand.name },
      { name: "description", content: "How verification, declared belongings, secure payments and booking-based reviews work on the platform." },
      { property: "og:title", content: "Trust & Safety — " + brand.name },
      { property: "og:description", content: "How verification, declared belongings, secure payments and booking-based reviews work on the platform." },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Trust and safety</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">How verification, declared belongings, secure payments and booking-based reviews work on the platform.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Identity verification", "Space verification", "Declared belongings", "Secure payments", "Private addresses", "Booking-based reviews"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
