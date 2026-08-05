/** React Query wiring for the notification centre. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  archiveNotification,
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications-api";
import { hasMorePages, NOTIFICATION_PAGE_SIZE, type Notification } from "@/lib/notifications";

export const notificationKeys = {
  all: ["notifications"] as const,
  feed: ["notifications", "feed"] as const,
  unread: ["notifications", "unread-count"] as const,
};

/**
 * Paged feed, newest first, 20 at a time. No realtime subscription is added:
 * the project does not already use Supabase realtime, so the badge and feed
 * refresh through ordinary polling and query invalidation instead.
 */
export function useNotificationFeed() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: notificationKeys.feed,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listNotifications(pageParam as number),
    getNextPageParam: (lastPage: Notification[], allPages) =>
      hasMorePages(lastPage.length, NOTIFICATION_PAGE_SIZE) ? allPages.length : undefined,
    enabled: Boolean(user),
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id, true),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });
}

export function useArchiveNotification() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => archiveNotification(id),
    onSuccess: invalidate,
  });
}
