import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/Logo";
import { AccountMenu } from "@/components/account/AccountMenu";
import { marketingNav } from "@/config/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Top navigation for logged-out / marketing pages. */
export function SiteHeader({ className }: { className?: string }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { session, mode, loading } = useAuth();
  const dashboardTo = mode === "host" ? "/host" : "/renter";
  const signedIn = Boolean(session);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo variant="header" />

        <nav aria-label="Main" className="ml-6 hidden min-w-0 items-center gap-0.5 xl:flex">
          {marketingNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-lg px-2 py-2 text-[0.9375rem] font-semibold leading-snug text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-foreground bg-secondary" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 xl:flex">
          {loading ? null : signedIn ? (
            <>
              <Button variant="secondary" asChild>
                <Link to={dashboardTo}>Dashboard</Link>
              </Button>
              <AccountMenu />
            </>
          ) : (
            <>
              <Button variant="text" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/get-started">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 xl:hidden">
          {signedIn ? (
            <Button size="sm" variant="secondary" asChild>
              <Link to={dashboardTo}>Dashboard</Link>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to="/get-started">Get Started</Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu aria-hidden="true" />
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </Button>
        </div>
      </div>

      {menuOpen ? (
        <div id="mobile-menu" className="border-t border-border bg-background lg:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl space-y-1 px-4 py-3 sm:px-6">
            {marketingNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-3 type-nav text-foreground transition-colors hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2">
              {signedIn ? (
                <>
                  <Button variant="secondary" block asChild>
                    <Link to="/profile" onClick={() => setMenuOpen(false)}>
                      Profile
                    </Link>
                  </Button>
                  <Button block asChild>
                    <Link to={dashboardTo} onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" block asChild>
                    <Link to="/login" onClick={() => setMenuOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                  <Button block asChild>
                    <Link to="/get-started" onClick={() => setMenuOpen(false)}>
                      Get Started
                    </Link>
                  </Button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 type-body-sm text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
              Close menu
            </button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
