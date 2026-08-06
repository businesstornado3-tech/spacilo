/**
 * Booking messaging.
 *
 * A conversation only ever exists for a booking, and only its two participants
 * can read or write it — enforced by RLS, mirrored here. Nothing is generated
 * automatically: every message is written by a person.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ConversationSummary } from "@/lib/messages";

export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;

export async function getOrCreateBookingConversation(bookingId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc("get_or_create_booking_conversation", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return data as unknown as Conversation;
}

export async function listMyConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const MAX_MESSAGE_LENGTH = 2000;

export async function sendMessage(input: {
  conversation: Conversation;
  senderId: string;
  body: string;
}): Promise<Message> {
  const body = input.body.trim();
  if (!body) throw new Error("Write a message before sending.");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must be under ${MAX_MESSAGE_LENGTH} characters.`);
  }
  const role = input.senderId === input.conversation.host_id ? "host" : "renter";
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversation.id,
      booking_id: input.conversation.booking_id,
      sender_id: input.senderId,
      sender_role: role,
      body,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Pre-booking enquiry thread for a published space (Prompt 23E).
 * One thread per renter per space; the server decides the host and refuses
 * self-enquiries. Nothing about this reserves capacity or moves money.
 */
export async function getOrCreateSpaceConversation(spaceId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc("get_or_create_space_conversation", {
    p_space_id: spaceId,
  });
  if (error) throw error;
  return data as unknown as Conversation;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** True for a thread that exists before any booking. */
export const isEnquiry = (conversation: Conversation): boolean => conversation.booking_id === null;

/* ------------------------------------------------ inbox (Prompt 26B) */

/** Inbox rows: unread counts, previews and listing context, computed server-side. */
export async function listConversationSummaries(archived = false): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc("list_my_conversations", { p_archived: archived });
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function setConversationArchived(
  conversationId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_conversation_archived", {
    p_conversation_id: conversationId,
    p_archived: archived,
  });
  if (error) throw error;
}

/** Sends a thread to the Spacilo moderation queue. Never resolves it here. */
export async function reportConversation(input: {
  conversationId: string;
  reason: string;
  details?: string;
}): Promise<string> {
  const details = input.details?.trim();
  const { data, error } = await supabase.rpc("report_conversation", {
    p_conversation_id: input.conversationId,
    p_reason: input.reason,
    ...(details ? { p_details: details } : {}),
  });
  if (error) throw error;
  return data as string;
}
