import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { GOOGLE_SECTION_ID, googleIntro, googleSections } from "@/data/google-data";
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

        <section id={GOOGLE_SECTION_ID} className="mt-14 max-w-3xl scroll-mt-24">
          <h2 className="type-h2">Google User Data and YouTube Integration</h2>
          <p className="mt-3 type-body text-muted-foreground">{googleIntro}</p>

          <div className="mt-6 grid gap-6">
            {googleSections.map((section) => (
              <article key={section.heading} className="rounded-xl border border-border bg-card p-5">
                <h3 className="type-h3 text-foreground">{section.heading}</h3>
                <p className="mt-2 type-body-sm text-muted-foreground">{section.body}</p>
                {section.bullets ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5 type-body-sm text-muted-foreground">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <p className="mt-8 max-w-3xl type-body-sm text-muted-foreground">
          To ask us to delete your data, follow the{" "}
          <Link to="/legal/data-deletion" className="underline underline-offset-2">
            data deletion instructions
          </Link>
          . Privacy questions can be sent to{" "}
          <a href={`mailto:${brand.supportEmail}`} className="underline underline-offset-2">
            {brand.supportEmail}
          </a>
          .
        </p>

        <p className="mt-8 max-w-3xl type-body-sm text-muted-foreground">{legalReviewNotice}</p>
      </PageSection>
    </MarketingLayout>
  );
}
