/**
 * Client-side data access for support cases (Prompt 18).
 *
 * Participants may READ their own booking's cases and ADD messages/evidence.
 * Every status change, assignment, resolution and refund is a privileged
 * server operation — none of them are reachable from this module.
 */
import { supabase } from "@/integrations/supabase/client";
import { EVIDENCE_BUCKET } from "@/lib/handover-api";
import {
  caseEvidencePath,
  evidenceFileProblem,
  type CaseParty,
  type SupportCase,
  type SupportCaseCategory,
  type SupportCaseEvent,
  type SupportCaseEvidence,
  type SupportCaseMessage,
  type SupportCaseStage,
} from "@/lib/support-cases";

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("You need to be signed in.");
  return id;
}

export async function listBookingSupportCases(bookingId: string): Promise<SupportCase[]> {
  const { data, error } = await supabase
    .from("booking_support_cases")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSupportCase(caseId: string): Promise<SupportCase | null> {
  const { data, error } = await supabase
    .from("booking_support_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listCaseMessages(caseId: string): Promise<SupportCaseMessage[]> {
  const { data, error } = await supabase
    .from("booking_support_case_messages")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listCaseEvents(caseId: string): Promise<SupportCaseEvent[]> {
  const { data, error } = await supabase
    .from("booking_support_case_events")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listCaseEvidence(caseId: string): Promise<SupportCaseEvidence[]> {
  const { data, error } = await supabase
    .from("booking_support_case_evidence")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Server-side function: validates participation and de-duplicates live cases. */
export async function openSupportCase(input: {
  bookingId: string;
  category: SupportCaseCategory;
  stage: SupportCaseStage;
  summary: string;
  description: string;
  handoverIssueId?: string | null;
}): Promise<SupportCase> {
  const { data, error } = await supabase.rpc("open_support_case", {
    p_booking_id: input.bookingId,
    p_category: input.category,
    p_stage: input.stage,
    p_summary: input.summary.trim(),
    p_description: input.description.trim(),
    ...(input.handoverIssueId ? { p_handover_issue_id: input.handoverIssueId } : {}),
  });
  if (error) throw new Error("We couldn't create the support case. Please try again.");
  return data as unknown as SupportCase;
}

export async function addCaseMessage(input: { caseId: string; body: string }): Promise<void> {
  const { error } = await supabase.rpc("add_support_case_message", {
    p_case_id: input.caseId,
    p_body: input.body.trim(),
  });
  if (error) {
    throw new Error(
      error.message.includes("case_closed_to_updates")
        ? "This case is no longer accepting participant updates."
        : "We couldn't add that update. Please try again.",
    );
  }
}

export async function uploadCaseEvidence(input: {
  caseId: string;
  bookingId: string;
  role: CaseParty;
  file: File;
  caption?: string;
}): Promise<SupportCaseEvidence> {
  const problem = evidenceFileProblem(input.file);
  if (problem) throw new Error(problem);

  const uploaderId = await currentUserId();
  const path = caseEvidencePath({
    bookingId: input.bookingId,
    caseId: input.caseId,
    uploaderId,
    fileName: input.file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw new Error("That file couldn't be uploaded.");

  const { data, error } = await supabase
    .from("booking_support_case_evidence")
    .insert({
      case_id: input.caseId,
      booking_id: input.bookingId,
      uploaded_by_user_id: uploaderId,
      uploaded_by_role: input.role,
      storage_path: path,
      mime_type: input.file.type,
      file_size: input.file.size,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    throw new Error("That file couldn't be uploaded.");
  }
  return data;
}

/** Private bucket: display always uses short-lived signed URLs. */
export async function signedCaseEvidenceUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  });
  return map;
}

/* ------------------------------------------------------------ staff reads */

export interface RefundablePayment {
  payment_id: string;
  period_label: string;
  period_index: number;
  is_extension: boolean;
  currency: string;
  paid_pence: number;
  refunded_pence: number;
  remaining_pence: number;
}

/** Authoritative, server-calculated. The browser never derives these amounts. */
export async function caseRefundablePayments(caseId: string): Promise<RefundablePayment[]> {
  const { data, error } = await supabase.rpc("support_case_refundable", { p_case_id: caseId });
  if (error) throw error;
  return (data ?? []) as RefundablePayment[];
}

export async function isSupportStaff(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_support_staff");
  if (error) return false;
  return Boolean(data);
}

export interface CaseQueueFilters {
  status?: string;
  category?: string;
}

export async function listSupportQueue(filters: CaseQueueFilters = {}): Promise<SupportCase[]> {
  let query = supabase.from("booking_support_cases").select("*");
  if (filters.status === "open") query = query.eq("status", "open");
  else if (filters.status === "waiting")
    query = query.in("status", ["waiting_for_reporter", "waiting_for_other_party"]);
  else if (filters.status === "under_review") query = query.eq("status", "under_review");
  else if (filters.status === "resolved") query = query.in("status", ["resolved", "closed"]);
  if (filters.category) query = query.eq("category", filters.category as SupportCaseCategory);

  const { data, error } = await query.order("last_activity_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}
