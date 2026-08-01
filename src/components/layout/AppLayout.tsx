import { Link } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { AppSideNav, MobileBottomNav } from "@/components/layout/AppNav";
import { Button } from "@/components/ui/button";
import type { UserMode } from "@/config/navigation";

/**
 * Shell for signed-in areas.
 * Mode switching is presentational for now — no auth is wired up yet.
 */
export function AppLayout({
  mode,
  title,
  description,
  actions,
  children,
}: {
  mode: UserMode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const otherMode: UserMode = mode === "host" ? "renter" : "host";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo to={mode === "host" ? "/host" : "/renter"} />
          <Button variant="secondary" size="sm" className="ml-auto" asChild>
            <Link to={otherMode === "host" ? "/host" : "/renter"}>
              <ArrowLeftRight aria-hidden="true" />
              <span className="hidden sm:inline">
                Switch to {otherMode === "host" ? "hosting" : "renting"}
              </span>
              <span className="sm:hidden">{otherMode === "host" ? "Host" : "Rent"}</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <AppSideNav mode={mode} />
        <main id="main" className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="type-h1">{title}</h1>
              {description ? (
                <p className="mt-2 max-w-prose type-body text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex gap-2">{actions}</div> : null}
          </div>
          <div className="mt-6">{children}</div>
        </main>
      </div>

      <MobileBottomNav mode={mode} />
    </div>
  );
}
