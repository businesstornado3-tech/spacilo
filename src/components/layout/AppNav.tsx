import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { navForMode, type UserMode } from "@/config/navigation";

/** Fixed bottom navigation for signed-in mobile users. */
export function MobileBottomNav({ mode, className }: { mode: UserMode; className?: string }) {
  // Profile lives in the account menu, so the mobile bar keeps to five targets.
  const items = navForMode(mode).filter((item) => item.to !== "/profile").slice(0, 5);

  return (
    <nav
      aria-label={`${mode === "host" ? "Host" : "Renter"} navigation`}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = item.icon!;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === "/renter" || item.to === "/host" }}
                className="flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="text-[0.6875rem] font-semibold">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sidebar equivalent for tablet and desktop. */
export function AppSideNav({ mode }: { mode: UserMode }) {
  const items = navForMode(mode);

  return (
    <nav
      aria-label={`${mode === "host" ? "Host" : "Renter"} navigation`}
      className="hidden w-56 shrink-0 md:block"
    >
      <ul className="sticky top-20 space-y-1">
        {items.map((item) => {
          const Icon = item.icon!;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === "/renter" || item.to === "/host" }}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 type-nav text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-primary-soft text-primary-soft-foreground" }}
              >
                <Icon className="size-[1.15rem]" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
