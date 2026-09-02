/**
 * /legal/$doc — one legal placeholder document.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Scale } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { findLegalDocument, LEGAL_REVIEW_NOTICE, type LegalSection } from "@/data/legal";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

export const Route = createFileRoute("/legal/$doc")({
  loader: ({ params }) => {
    const doc = findLegalDocument(params.doc);
    if (!doc) throw notFound();
    return doc;
  },
  head: ({ params, loaderData }) => {
    const title = `${loaderData?.title ?? "Legal"} — ${brand.name}`;
    const description = loaderData?.description ?? `Legal documents for ${brand.name}.`;
    return {
      ...publicRouteMeta({ title, description, path: `/legal/${params.doc}` }),
      scripts: [
        jsonLdScript(
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Legal", path: "/legal" },
            { name: loaderData?.title ?? "Document", path: `/legal/${params.doc}` },
          ]),
        ),
      ],
    };
  },
  component: LegalDocPage,
});

function LegalDocPage() {
  const doc = Route.useLoaderData();

  return (
    <MarketingLayout>
      <PageSection>
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-overline text-foreground">
            <Scale className="size-4" aria-hidden="true" />
            Legal
          </span>
          <h1 className="mt-4 type-h1">{doc.title}</h1>
          <p className="mt-3 type-body text-muted-foreground">{doc.intro}</p>
        </div>

        <div className="mt-8 grid max-w-3xl gap-6">
          {doc.sections.map((section: LegalSection) => (
            <article key={section.heading} className="rounded-xl border border-border bg-card p-5">
              <h2 className="type-h3 text-foreground">{section.heading}</h2>
              <p className="mt-2 type-body-sm text-muted-foreground">{section.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-3xl type-body-sm text-muted-foreground">{LEGAL_REVIEW_NOTICE}</p>
        <p className="mt-4 max-w-3xl type-body-sm text-muted-foreground">
          <Link to="/legal" className="underline underline-offset-2">
            All legal documents
          </Link>
        </p>
      </PageSection>
    </MarketingLayout>
  );
}
