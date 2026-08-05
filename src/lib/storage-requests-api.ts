/**
 * Data access for storage requests.
 *
 * Creation goes through the `create_storage_request` routine, which builds the
 * price / inventory / SpaceFit snapshot server-side and enforces the rules the
 * UI can only hint at (published space, own inventory, no self-request,
 * confirmed items, valid dates). Reads and withdrawal are plain RLS-scoped
 * table calls, so a renter only ever touches their own requests.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { StorageRequest } from "@/lib/storage-requests";
import type { SpaceFitResult } from "@/lib/spacefit/types";
import type { SpaceFitPlanSnapshot } from "@/lib/spacefit/plan";

/**
 * Snapshot payload for the SpaceFit result shown at the moment of request.
 *
 * `create_storage_request` reads `score`, `label`, `breakdown`, `algorithm`
 * and `plan` out of this object and freezes them onto the request. The space's
 * geometry is snapshotted server-side from `spaces`, never from here.
 */
export function spaceFitPayload(
  result: SpaceFitResult | null,
  plan?: SpaceFitPlanSnapshot | null,
): Json | undefined {
  if (!result && !plan) return undefined;
  return {
    score: result?.score ?? null,
    label: result?.label ?? null,
    compatible: result?.compatible ?? null,
    components: result?.components ?? null,
    breakdown: result?.components ?? null,
    algorithm: result?.algorithm ?? null,
    positives: result?.positives ?? [],
    warnings: result?.warnings ?? [],
    plan: plan ?? null,
  } as unknown as Json;
}

export interface CreateRequestInput {
  spaceId: string;
  inventoryId: string;
  startDate: string;
  endDate: string;
  note?: string;
  spaceFit?: SpaceFitResult | null;
  /** Frozen requirement + packing plan, built from confirmed inventory only. */
  plan?: SpaceFitPlanSnapshot | null;
}

export async function createStorageRequest(input: CreateRequestInput): Promise<StorageRequest> {
  const spacefit = spaceFitPayload(input.spaceFit ?? null, input.plan ?? null);
  const { data, error } = await supabase.rpc("create_storage_request", {
    p_space_id: input.spaceId,
    p_inventory_id: input.inventoryId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    ...(input.note ? { p_renter_note: input.note } : {}),
    ...(spacefit ? { p_spacefit: spacefit } : {}),
  });

  if (error) throw error;
  return data as unknown as StorageRequest;
}

export async function listMyRequests(): Promise<StorageRequest[]> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMyRequest(id: string): Promise<StorageRequest | null> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Withdrawal only ever applies to a pending request the renter owns. */
export async function withdrawRequest(id: string): Promise<StorageRequest> {
  const { data, error } = await supabase
    .from("storage_requests")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Existing live request for a space, used to stop duplicate requests. */
export async function pendingRequestForSpace(spaceId: string): Promise<StorageRequest | null> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .eq("space_id", spaceId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------- host */

/**
 * Every request sent to spaces this host owns. RLS ("Hosts read requests for
 * their spaces") scopes the rows, so one host can never read another's.
 */
export async function listHostRequests(): Promise<StorageRequest[]> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getHostRequest(id: string): Promise<StorageRequest | null> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Accept or decline. The decision is made by `respond_to_storage_request`,
 * which re-checks ownership, pending status and expiry inside a single
 * conditional UPDATE — so a stale page or a double click can't win a race.
 */
export async function respondToRequest(input: {
  id: string;
  decision: "accepted" | "declined";
  declineReason?: string;
}): Promise<StorageRequest> {
  const { data, error } = await supabase.rpc("respond_to_storage_request", {
    p_request_id: input.id,
    p_decision: input.decision,
    ...(input.declineReason ? { p_decline_reason: input.declineReason } : {}),
  });
  if (error) throw error;
  return data as unknown as StorageRequest;
}

/** This renter's own requests for one space (RLS + explicit renter filter). */
export async function myRequestsForSpace(
  spaceId: string,
  renterId: string,
): Promise<StorageRequest[]> {
  const { data, error } = await supabase
    .from("storage_requests")
    .select("*")
    .eq("space_id", spaceId)
    .eq("renter_id", renterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
