import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — " + brand.name },
      { name: "description", content: "Account access will be added once authentication is built." },
      { property: "og:title", content: "Log in — " + brand.name },
      { property: "og:description", content: "Account access will be added once authentication is built." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <h1 className="type-h1">Log in</h1>
        <p className="mt-3 max-w-prose type-body text-muted-foreground">Account access will be added once authentication is built.</p>
        <div className="mt-8">
          <PagePlaceholder
            title="Not built yet"
            description="This route exists so navigation and structure are in place. The feature itself comes in a later step."
            planned={["Email and password", "Magic link", "Session handling"]}
          />
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
