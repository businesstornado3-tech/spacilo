/** React Query wiring for booking messages. Both sides read through RLS. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateBookingConversation,
  listMessages,
  listMyConversations,
  sendMessage,
  type Conversation,
} from "@/lib/messages-api";

export const messageKeys = {
  conversations: ["conversations"] as const,
  forBooking: (bookingId: string) => ["conversations", "booking", bookingId] as const,
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
