import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Get Started — " + brand.name },
      { name: "description", content: "Sign-up will let people join as a renter, a host, or both." },
      { property: "og:title", content: "Get Started — " + brand.name },
      { property: "og:description", content: "Sign-up will let people join as a renter, a host, or both." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Create your account</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">Sign-up will let people join as a renter, a host, or both.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Renter sign-up", "Host sign-up", "Mode switching", "Verification steps"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
