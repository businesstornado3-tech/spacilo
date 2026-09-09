/**
 * /legal/data-deletion — public data deletion instructions.
 *
 * This URL is given to Meta as the "User data deletion instructions URL", so
 * it must stay public, indexable and free of placeholder text.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { deletionIntro, deletionSections } from "@/data/data-deletion";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = `Data Deletion Instructions — ${brand.name}`;
const description = `How to ask ${brand.name} to delete your personal data, remove a linked Facebook, Instagram or Google connection, and what happens after a request.`;

export const Route = createFileRoute("/legal/data-deletion")({
  head: () => ({
    ...publicRouteMeta({ title, description, path: "/legal/data-deletion" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Legal", path: "/legal" },
          { name: "Data Deletion Instructions", path: "/legal/data-deletion" },
        ]),
      ),
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-overline text-foreground">
            <Trash2 className="size-4" aria-hidden="true" />
            {brand.name}
          </span>
          <h1 className="mt-4 type-h1">Data Deletion Instructions</h1>
          <p className="mt-3 type-body text-muted-foreground">{deletionIntro}</p>
        </div>

        <div className="mt-10 grid max-w-3xl gap-6">
          {deletionSections.map((section) => (
            <article key={section.heading} className="rounded-xl border border-border bg-card p-5">
              <h2 className="type-h3 text-foreground">{section.heading}</h2>
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

        <div className="mt-8 flex max-w-3xl flex-wrap gap-x-6 gap-y-2 type-body-sm">
          <a
            href={`mailto:${brand.supportEmail}?subject=Data%20deletion%20request`}
            className="underline underline-offset-2"
          >
            Email {brand.supportEmail}
          </a>
          <Link to="/privacy" className="underline underline-offset-2">
            Privacy and data
          </Link>
          <Link to="/legal" className="underline underline-offset-2">
            All legal documents
          </Link>
        </div>
      </PageSection>
    </MarketingLayout>
  );
}
