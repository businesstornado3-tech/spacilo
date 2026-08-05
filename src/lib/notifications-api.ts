/**
 * Notification data access. Reads go through RLS (own rows only); writes are
 * limited to the controlled read-state RPCs. Nothing here can create a
 * notification — that only ever happens inside authoritative database
 * triggers.
 */
import { supabase } from "@/integrations/supabase/client";
import { NOTIFICATION_PAGE_SIZE, pageRange, type Notification } from "@/lib/notifications";

export async function listNotifications(page = 0): Promise<Notification[]> {
  const { from, to } = pageRange(page, NOTIFICATION_PAGE_SIZE);
  const { data, error } = await supabase
    .from("user_notifications")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return data ?? [];
}

/** Authoritative unread count — never a client-side tally. */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: id,
    p_read: read,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function archiveNotification(id: string): Promise<void> {
  const { error } = await supabase.rpc("archive_notification", { p_notification_id: id });
  if (error) throw error;
}
