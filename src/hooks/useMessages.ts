/** React Query wiring for booking messages. Both sides read through RLS. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { totalUnread } from "@/lib/messages";
import {
  getConversation,
  getOrCreateBookingConversation,
  getOrCreateSpaceConversation,
  listConversationSummaries,
  listMessages,
  markConversationRead,
  reportConversation,
  setConversationArchived,
  listMyConversations,
  sendMessage,
  type Conversation,
} from "@/lib/messages-api";

export const messageKeys = {
  conversations: ["conversations"] as const,
  forBooking: (bookingId: string) => ["conversations", "booking", bookingId] as const,
  forSpace: (spaceId: string) => ["conversations", "space", spaceId] as const,
  thread: (conversationId: string) => ["messages", conversationId] as const,
};

export function useMyConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: messageKeys.conversations,
    queryFn: listMyConversations,
    enabled: Boolean(user),
  });
}

/** Opens (creating if needed) the single conversation for one booking. */
export function useBookingConversation(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: messageKeys.forBooking(bookingId ?? "none"),
    queryFn: () => getOrCreateBookingConversation(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useMessages(conversationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: messageKeys.thread(conversationId ?? "none"),
    queryFn: () => listMessages(conversationId as string),
    enabled: Boolean(user && conversationId),
    refetchInterval: 15_000,
  });
}

export function useSendMessage(conversation: Conversation | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!conversation || !user) throw new Error("This conversation isn't open yet.");
      return sendMessage({ conversation, senderId: user.id, body });
    },
    onSuccess: (message) => {
      void qc.invalidateQueries({ queryKey: messageKeys.thread(message.conversation_id) });
      void qc.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}

/** Opens (creating if needed) the renter's pre-booking enquiry for a space. */
export function useSpaceConversation(spaceId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: messageKeys.forSpace(spaceId ?? "none"),
    queryFn: () => getOrCreateSpaceConversation(spaceId as string),
    enabled: Boolean(user && spaceId && enabled),
    retry: false,
  });
}

export function useConversation(conversationId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversation", conversationId ?? "none"] as const,
    queryFn: () => getConversation(conversationId as string),
    enabled: Boolean(user && conversationId),
  });
}

/* ------------------------------------------------ inbox (Prompt 26B) */

/** Professional inbox: unread counts and previews come from the server. */
export function useConversationSummaries(archived = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...messageKeys.conversations, "summaries", archived] as const,
    queryFn: () => listConversationSummaries(archived),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
}

export function useUnreadMessageCount() {
  const { data } = useConversationSummaries(false);
  return totalUnread(data ?? []);
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}

export function useSetConversationArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; archived: boolean }) =>
      setConversationArchived(input.conversationId, input.archived),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}

export function useReportConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; reason: string; details?: string }) =>
      reportConversation(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}
