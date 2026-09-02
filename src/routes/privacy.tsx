import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { legalReviewNotice, measurementSections, privacyIntro } from "@/data/privacy";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = `Privacy and data — ${brand.name}`;
const description =
  "How EarnRoom handles accounts, bookings, uploaded photos, AI-assisted estimates, anonymous analytics and browser storage, with launch review still required.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...publicRouteMeta({ title: title, description: description, path: "/privacy" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: title, path: "/privacy" },
        ]),
      ),
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-overline text-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Privacy
          </span>
          <h1 className="mt-4 type-h1">{privacyIntro.heading}</h1>
          <p className="mt-3 type-body text-muted-foreground">{privacyIntro.body}</p>
        </div>

        <div className="mt-10 grid max-w-3xl gap-6">
          {measurementSections.map((section) => (
            <article key={section.heading} className="rounded-xl border border-border bg-card p-5">
              <h2 className="type-h3 text-foreground">{section.heading}</h2>
              <p className="mt-2 type-body-sm text-muted-foreground">{section.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-3xl type-body-sm text-muted-foreground">{legalReviewNotice}</p>
      </PageSection>
    </MarketingLayout>
  );
}
