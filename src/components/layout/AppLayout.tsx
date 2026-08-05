import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/layout/Logo";
import { AppSideNav, MobileBottomNav } from "@/components/layout/AppNav";
import { AccountMenu, ModeSwitchButton } from "@/components/account/AccountMenu";
import { Skeleton } from "@/components/common/Skeletons";
import type { UserMode } from "@/config/navigation";
import { useAuth } from "@/hooks/useAuth";

/** Shell for signed-in areas. */
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
  const { loading, profile } = useAuth();
  const showSkeleton = loading && !profile;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo to={mode === "host" ? "/host" : "/renter"} />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ModeSwitchButton />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <AppSideNav mode={mode} />
        <main id="main" className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {showSkeleton ? (
                <>
                  <Skeleton className="h-9 w-56" />
                  <Skeleton className="mt-3 h-5 w-72" />
                </>
              ) : (
                <>
                  <h1 className="type-h1">{title}</h1>
                  {description ? (
                    <p className="mt-2 max-w-prose type-body text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {actions ? <div className="flex gap-2">{actions}</div> : null}
          </div>
          <div className="mt-6">{showSkeleton ? <Skeleton className="h-48 w-full" /> : children}</div>
        </main>
      </div>

      <MobileBottomNav mode={mode} />
    </div>
  );
}

export { Link };
