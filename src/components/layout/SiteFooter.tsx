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

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16">
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

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.heading}>
                <h2 className="type-overline text-foreground">{col.heading}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={`${col.heading}-${l.label}`}>
                      <Link
                        to={l.to}
                        {...(l.search ? { search: l.search } : {})}
                        className="type-body-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-8">
          {TRUST.map((item) => (
            <li key={item} className="inline-flex items-center gap-2 type-label">
              <Check className="size-4 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
          <p className="type-body-sm text-muted-foreground">
            © {new Date().getFullYear()} {brand.legalName}. Built with AI. Powered by local
            communities.
          </p>
          <p className="type-body-sm text-muted-foreground">
            Preparing for our {brand.pilotAreas[0]} pilot. Prices in GBP (£).
          </p>
        </div>
      </div>
    </footer>
  );
}
