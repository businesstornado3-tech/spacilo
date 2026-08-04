/**
 * Booking messaging.
 *
 * A conversation only ever exists for a booking, and only its two participants
 * can read or write it — enforced by RLS, mirrored here. Nothing is generated
 * automatically: every message is written by a person.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
