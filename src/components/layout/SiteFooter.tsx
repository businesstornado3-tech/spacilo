import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { Logo } from "@/components/layout/Logo";

interface FooterLink {
  label: string;
  to: string;
}

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: brand.name,
    links: [
      { label: "How It Works", to: "/how-it-works" },
      { label: "Trust & Safety", to: "/trust" },
    ],
  },
  {
    heading: "Renters",
    links: [
      { label: "Find Storage", to: "/search" },
      { label: "Scan My Stuff", to: "/spacefit/stuff" },
    ],
  },
  {
    heading: "Hosts",
    links: [
      { label: "List Your Space", to: "/list-space" },
      { label: "Scan My Space", to: "/spacefit/space" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Storage Policy", to: "/storage-policy" },
      { label: "Privacy & Data", to: "/privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 type-body-sm text-muted-foreground">{brand.propositions.trust}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.heading}>
                <h2 className="type-overline text-foreground">{col.heading}</h2>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={`${col.heading}-${l.label}`}>
                      <Link
                        to={l.to}
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

        <div className="mt-10 border-t border-border pt-6">
          <p className="type-body-sm text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}
          </p>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Preparing for our {brand.pilotAreas[0]} pilot. Prices in GBP (£).
          </p>
        </div>
      </div>
    </footer>
  );
}
