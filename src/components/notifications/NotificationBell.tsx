/** Header bell with an authoritative unread badge. */
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { badgeCount } from "@/lib/notifications";

export function NotificationBell() {
  const { data: unread = 0 } = useUnreadNotificationCount();

  return (
    <Link
      to="/notifications"
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications, none unread"
      }
      className="relative grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[0.625rem] font-semibold leading-5 text-destructive-foreground"
        >
          {badgeCount(unread)}
        </span>
      ) : null}
    </Link>
  );
}
