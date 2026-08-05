/** The notification centre feed: filters, paging and read controls. */
import * as React from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/States";
import { Skeleton } from "@/components/common/Skeletons";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
} from "@/hooks/useNotifications";
import {
  applyFilter,
  FEED_COPY,
  feedState,
  type FeedFilter,
  type Notification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "action", label: "Needs action" },
];

export function NotificationList() {
  const [filter, setFilter] = React.useState<FeedFilter>("all");
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotificationFeed();
  const { data: unread = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const archive = useArchiveNotification();

  const all: Notification[] = React.useMemo(
    () => (data?.pages ?? []).flat() as Notification[],
    [data],
  );
  const shown = applyFilter(all, filter);
  const state = feedState(all);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter notifications" className="flex flex-wrap gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "min-h-9 rounded-lg px-3 type-body-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === option.value
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button
          className="ml-auto"
          variant="secondary"
          size="sm"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Mark all as read
        </Button>
      </div>

      {state !== "has_unread" && shown.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Bell}
          title={FEED_COPY[state].title || "You're all caught up."}
          description={FEED_COPY[state].body || undefined}
        />
      ) : null}

      {shown.length === 0 && state === "has_unread" ? (
        <EmptyState
          className="mt-6"
          icon={Bell}
          title="Nothing matches this filter"
          description="Switch back to All to see your full notification history."
        />
      ) : null}

      <ul className="mt-6 space-y-3">
        {shown.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onOpen={(n) => {
              if (n.read_at === null) markRead.mutate(n.id);
            }}
            onMarkRead={(n) => markRead.mutate(n.id)}
          />
        ))}
      </ul>

      {hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      {archive.isError ? (
        <p className="mt-4 type-body-sm text-destructive">
          That item is no longer available. Try refreshing the page.
        </p>
      ) : null}
    </div>
  );
}
