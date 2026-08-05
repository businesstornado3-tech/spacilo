/**
 * One notification row. Clicking marks it read and navigates to its target;
 * marking read never completes the underlying action.
 */
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  eventLabel,
  isUnread,
  priorityFor,
  PRIORITY_LABEL,
  safeActionPath,
  type Notification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const BADGE_VARIANT = {
  informational: "neutral",
  action_required: "warning",
  important: "destructive",
} as const;

export function NotificationItem({
  notification,
  onOpen,
  onMarkRead,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
  onMarkRead: (notification: Notification) => void;
}) {
  const unread = isUnread(notification);
  const priority = priorityFor(notification);
  const path = safeActionPath(notification.action_path);

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4 shadow-card",
        unread ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Unread is stated in text, not by colour alone. */}
            <span className="type-body-sm font-semibold text-muted-foreground">
              {eventLabel(notification.event_type)}
            </span>
            <Badge variant={BADGE_VARIANT[priority]} size="sm">
              {PRIORITY_LABEL[priority]}
            </Badge>
            {unread ? (
              <Badge variant="subtle" size="sm">
                Unread
              </Badge>
            ) : null}
          </div>
          <p className={cn("mt-1 break-words type-body", unread && "font-semibold")}>
            {notification.title}
          </p>
          <p className="mt-1 break-words type-body-sm text-muted-foreground">{notification.body}</p>
          <p className="mt-1 type-body-sm text-muted-foreground">
            <time dateTime={notification.created_at} title={formatDateTime(notification.created_at)}>
              {formatRelativeTime(notification.created_at)}
            </time>
            <span className="sr-only"> — {formatDateTime(notification.created_at)}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {path ? (
            <Button size="sm" asChild onClick={() => onOpen(notification)}>
              <Link to={path}>Open</Link>
            </Button>
          ) : null}
          {unread ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onMarkRead(notification)}
              aria-label={`Mark "${notification.title}" as read`}
            >
              <Check aria-hidden="true" />
              Mark as read
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
