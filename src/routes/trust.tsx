import { createFileRoute, Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { Reveal } from "@/components/common/Reveal";
import { trustCore, trustFaqNote, trustSections } from "@/data/trust";

const title = "Trust & Safety — " + brand.name;
const description =
  "How " +
  brand.name +
  " supports trust: policy screening, declarations, fit and suitability information, price protection and honest AI transparency.";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <Reveal>
          <p className="type-overline text-muted-foreground">Trust &amp; Safety</p>
          <h1 className="mt-2 type-h1">{trustCore.heading}</h1>
          <p className="mt-4 max-w-prose type-body text-muted-foreground">{trustCore.body}</p>
        </Reveal>
      </PageSection>

      <PageSection className="pt-0">
        <ul className="grid gap-4 sm:grid-cols-2">
          {trustSections.map((section, i) => (
            <Reveal as="li" key={section.heading} delay={i * 40}>
              <article className="h-full rounded-2xl border border-border bg-card p-5 sm:p-6">
                <h2 className="type-card-title">{section.heading}</h2>
                <p className="mt-2 type-body-sm text-muted-foreground">{section.body}</p>
              </article>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={200}>
          <p className="mt-8 type-body-sm text-muted-foreground">
            {trustFaqNote}{" "}
            <Link to="/how-it-works" className="text-primary underline-offset-4 hover:underline">
              Read How It Works
            </Link>
            . For what can and can't be stored, see the{" "}
            <Link to="/storage-policy" className="text-primary underline-offset-4 hover:underline">
              storage policy
            </Link>
            .
          </p>
        </Reveal>
      </PageSection>
    </MarketingLayout>
  );
}
