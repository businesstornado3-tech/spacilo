/**
 * /legal — index of every legal document.
 *
 * Placeholder wording only; see `src/data/legal.ts`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Scale } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout, PageSection } from "@/components/layout/MarketingLayout";
import { LEGAL_DOCUMENTS } from "@/data/legal";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = `Legal — ${brand.name}`;
const description = `Terms, cookies, refunds, cancellations, host and renter agreements, and the ${brand.ai} disclaimer for ${brand.name}.`;

export const Route = createFileRoute("/legal/")({
  head: () => ({
    ...publicRouteMeta({ title, description, path: "/legal" }),
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Legal", path: "/legal" },
        ]),
      ),
    ],
  }),
  component: LegalIndexPage,
});

function LegalIndexPage() {
  return (
    <MarketingLayout>
      <PageSection>
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-soft px-3 py-1 type-overline text-foreground">
            <Scale className="size-4" aria-hidden="true" />
            Legal
          </span>
          <h1 className="mt-4 type-h1">Legal documents</h1>
          <p className="mt-3 type-body text-muted-foreground">
            Everything that governs how {brand.name} works between renters, hosts and us.
          </p>
        </div>

        <ul className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
          {LEGAL_DOCUMENTS.map((doc) => (
            <li key={doc.slug}>
              <Link
                to="/legal/$doc"
                params={{ doc: doc.slug }}
                className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
              >
                <h2 className="type-h3 text-foreground">{doc.title}</h2>
                <p className="mt-2 type-body-sm text-muted-foreground">{doc.description}</p>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/storage-policy"
              className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
            >
              <h2 className="type-h3 text-foreground">Prohibited items</h2>
              <p className="mt-2 type-body-sm text-muted-foreground">
                The published storage policy lists what can and can&apos;t be stored.
              </p>
            </Link>
          </li>
          <li>
            <Link
              to="/privacy"
              className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
            >
              <h2 className="type-h3 text-foreground">Privacy &amp; data</h2>
              <p className="mt-2 type-body-sm text-muted-foreground">
                What we measure, what we never record, and how long we keep it.
              </p>
            </Link>
          </li>
        </ul>
      </PageSection>
    </MarketingLayout>
  );
}
