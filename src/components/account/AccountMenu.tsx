import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, ChevronDown, LogOut, User, Boxes, Home, Shield, LifeBuoy, LineChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import { useAuth, type UserMode } from "@/hooks/useAuth";
import { useIsPlatformAdmin } from "@/hooks/useAdminDashboard";
import { cn } from "@/lib/utils";

/** Switches the account between renting and hosting, enabling the mode if new. */
export function useModeSwitch() {
  const navigate = useNavigate();
  const { switchMode } = useAuth();
  const [switching, setSwitching] = React.useState(false);

  const go = React.useCallback(
    async (next: UserMode) => {
      setSwitching(true);
      try {
        await switchMode(next);
        toast.success(next === "host" ? "You're now in Host mode" : "You're now in Renter mode");
        await navigate({ to: next === "host" ? "/host" : "/renter" });
      } catch {
        toast.error("We couldn't switch mode", "Please try again in a moment.");
      } finally {
        setSwitching(false);
      }
    },
    [switchMode, navigate],
  );

  return { switchMode: go, switching };
}

export function ModeSwitchButton({ className }: { className?: string }) {
  const { mode } = useAuth();
  const { switchMode, switching } = useModeSwitch();
  const other: UserMode = mode === "host" ? "renter" : "host";

  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      disabled={switching}
      onClick={() => void switchMode(other)}
    >
      <ArrowLeftRight aria-hidden="true" />
      <span className="hidden sm:inline">
        Switch to {other === "host" ? "Hosting" : "Renting"}
      </span>
      <span className="sm:hidden">{other === "host" ? "Host" : "Rent"}</span>
    </Button>
  );
}

const links = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/renter", label: "Renting", icon: Boxes },
  { to: "/host", label: "Hosting", icon: Home },
  { to: "/trust", label: "Trust & Safety", icon: Shield },
  { to: "/how-it-works", label: "Help", icon: LifeBuoy },
] as const;

/** Account dropdown showing the current mode, key destinations and log out. */
export function AccountMenu() {
  const navigate = useNavigate();
  const { profile, user, mode, signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { switchMode, switching } = useModeSwitch();
  const { data: isAdmin } = useIsPlatformAdmin();
  const other: UserMode = mode === "host" ? "renter" : "host";

  React.useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "•";

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    toast.success("You're logged out");
    await navigate({ to: "/", replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary-soft type-label text-primary-soft-foreground">
          {initials}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Account menu</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-raised"
        >
          <div className="border-b border-border p-4">
            <p className="type-label">{profile?.first_name || "Your account"}</p>
            <p className="mt-0.5 truncate type-body-sm text-muted-foreground">{user?.email}</p>
            <p className="mt-3 type-body-sm text-muted-foreground">
              Currently: <span className="text-foreground">{mode === "host" ? "Hosting" : "Renting"}</span>
            </p>
            <button
              type="button"
              disabled={switching}
              onClick={() => {
                setOpen(false);
                void switchMode(other);
              }}
              className="mt-1 inline-flex items-center gap-1.5 type-body-sm text-primary underline-offset-4 hover:underline disabled:opacity-60"
            >
              Switch to {other === "host" ? "Hosting" : "Renting"}
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <ul className="p-1.5">
            {links.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 type-nav text-foreground transition-colors hover:bg-secondary",
                  )}
                >
                  <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
            {isAdmin ? (
              <li>
                <Link
                  to="/admin/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 type-nav text-foreground transition-colors hover:bg-secondary"
                >
                  <LineChart className="size-4 text-muted-foreground" aria-hidden="true" />
                  Founder dashboard
                </Link>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 type-nav text-foreground transition-colors hover:bg-secondary"
              >
                <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
                Log out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
