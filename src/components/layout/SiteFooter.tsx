import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { brand } from "@/config/brand";
import { Logo } from "@/components/layout/Logo";

interface FooterLink {
  label: string;
  to: string;
  search?: Record<string, unknown>;
}

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Browse",
    links: [
      { label: "Find storage", to: "/search" },
      { label: "Garages", to: "/search", search: { types: ["garage"] } },
      { label: "Lofts", to: "/search", search: { types: ["loft"] } },
      { label: "Spare rooms", to: "/search", search: { types: ["room"] } },
      { label: "Commercial", to: "/search", search: { types: ["commercial"] } },
    ],
  },
  {
    heading: "Hosting",
    links: [
      { label: "List your space", to: "/list-space" },
      { label: "Host guide", to: "/how-it-works" },
      { label: "Pricing & fees", to: "/how-it-works" },
      { label: "Earnings estimate", to: "/list-space" },
      { label: "Cover & protection", to: "/trust" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Help centre", to: "/how-it-works" },
      { label: "Trust & safety", to: "/trust" },
      { label: "Storage policy", to: "/storage-policy" },
      { label: "Privacy & data", to: "/privacy" },
      { label: "Terms", to: "/legal" },
    ],
  },
];

const TRUST = ["AI space planner", "Verified hosts", "Secure payments", "Community driven"];

function FooterColumn({ col }: { col: (typeof columns)[number] }) {
  const links = (
    <ul className="mt-4 space-y-2.5">
      {col.links.map((l) => (
        <li key={`${col.heading}-${l.label}`}>
          <Link
            to={l.to}
            {...(l.search ? { search: l.search } : {})}
            className="inline-flex min-h-11 items-center type-body-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Mobile: collapsible group. */}
      <details className="group border-b border-border py-1 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between type-overline text-foreground marker:hidden">
          {col.heading}
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="pb-3">{links}</div>
      </details>

      {/* Tablet and up: open column. */}
      <div className="hidden sm:block">
        <h2 className="type-overline text-foreground">{col.heading}</h2>
        {links}
      </div>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 type-card-title">
              Turn unused space into income. Find trusted storage nearby.
            </p>
            <p className="mt-2.5 type-body-sm text-muted-foreground">
              {brand.name} connects people who need storage with neighbours who have space to
              spare — with Spacilo AI showing how everything fits before anyone books.
            </p>
          </div>

          <nav aria-label="Footer" className="grid gap-0 sm:grid-cols-3 sm:gap-8">
            {columns.map((col) => (
              <FooterColumn key={col.heading} col={col} />
            ))}
          </nav>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-border pt-6 sm:mt-12 sm:gap-x-8 sm:gap-y-3 sm:pt-8">
          {TRUST.map((item) => (
            <li key={item} className="inline-flex items-center gap-2 type-label">
              <Check className="size-4 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>


        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
          <p className="type-body-sm text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}. Built with AI. Powered by local communities.
          </p>
          <p className="type-body-sm text-muted-foreground">
            Preparing for our {brand.pilotAreas[0]} pilot. Prices in GBP (£).
          </p>
        </div>
      </div>
    </footer>
  );
}
