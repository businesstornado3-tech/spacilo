import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { Logo } from "@/components/layout/Logo";
import { marketingNav } from "@/config/navigation";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 type-body-sm text-muted-foreground">{brand.propositions.trust}</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-2">
            {marketingNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="type-body-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/design-system"
              className="type-body-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Design system
            </Link>
          </nav>
        </div>
        <p className="mt-8 type-body-sm text-muted-foreground">
          © {new Date().getFullYear()} {brand.legalName}. Prices in GBP (£). Serving the{" "}
          {brand.country}.
        </p>
      </div>
    </footer>
  );
}
