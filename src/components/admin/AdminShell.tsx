/**
 * Founder console shell.
 *
 * Deliberately NOT the renter/host AppLayout: the founder console is an
 * operational surface, so it does not inherit marketplace navigation (Home,
 * My Stuff, Search, Requests…). It keeps the EarnRoom brand lock-up, offers an
 * explicit route back to the marketplace experience, and exposes only
 * admin-scoped section navigation.
 *
 * SECURITY: this is presentation only. Every figure it frames comes from
 * SECURITY DEFINER RPCs that re-check `is_platform_admin(auth.uid())`.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { AccountMenu } from "@/components/account/AccountMenu";
import { cn } from "@/lib/utils";

export interface AdminSection {
  id: string;
  label: string;
}

/** Section navigation for the founder console. In-page, so no extra routes. */
export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "marketplace", label: "Marketplace" },
  { id: "finance", label: "Finance" },
  { id: "traffic", label: "Traffic" },
  { id: "geography", label: "Demand geography" },
  { id: "earnroom-ai", label: "EarnRoom AI" },
  { id: "growth", label: "Growth radar" },
  { id: "operations", label: "Operations" },
  { id: "data-health", label: "Data health" },
];

export function AdminShell({
  title,
  description,
  toolbar,
  children,
}: {
  title: string;
  description?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo to="/admin/dashboard" variant="header" />
          <span className="hidden rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 type-body-xs font-semibold text-primary-soft-foreground sm:inline">
            Founder console
          </span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              to="/renter"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 type-nav text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-3"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to marketplace</span>
              <span className="sm:hidden">Marketplace</span>
            </Link>
            <AccountMenu />
          </div>
        </div>

        {/* Admin-only section navigation. Scrolls horizontally on narrow
            viewports rather than forcing a desktop sidebar into it. */}
        <nav aria-label="Founder console sections" className="border-t border-border">
          <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADMIN_SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 type-nav text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-h1">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-prose type-body-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/** A titled console section with a stable anchor target for the nav above. */
export function AdminSectionBlock({
  id,
  title,
  note,
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn("scroll-mt-32 border-t border-border pt-6 first:border-0 first:pt-0", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="type-h3">
          {title}
        </h2>
        {actions}
      </div>
      {note ? <p className="mt-1 max-w-prose type-body-xs text-muted-foreground">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}
