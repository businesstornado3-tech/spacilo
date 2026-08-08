import { useRouterState } from "@tanstack/react-router";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

/** Layout for public marketing and auth-adjacent pages. */
export function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Re-keying on pathname gives every route the same calm entrance.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main id="main" key={pathname} className="animate-fade flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 ${className ?? ""}`}>
      {children}
    </section>
  );
}
