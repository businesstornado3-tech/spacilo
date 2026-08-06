/**
 * Data access for the storage safety layer.
 *
 * Screening always comes back from the server routine so the browser can
 * never invent a friendlier answer than the policy gives.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  PolicySection,
  PolicyRule,
  PolicyVersion,
  PublicPolicyRule,
  ScreeningResult,
  SuitabilityAttributes,
  SuitabilityProfile,
} from "@/lib/policy/types";
import { sanitiseSuitability } from "@/lib/policy/suitability";

export async function getActivePolicy(): Promise<PolicyVersion | null> {
  const { data, error } = await supabase
    .from("storage_policy_versions")
    .select("*")
    .eq("status", "published")
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as unknown as PolicyVersion) : null;
}

export async function listPolicyVersions(): Promise<PolicyVersion[]> {
  const { data, error } = await supabase
    .from("storage_policy_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PolicyVersion[];
}

export async function listPolicyRules(policyVersionId: string): Promise<PolicyRule[]> {
  const { data, error } = await supabase
    .from("storage_policy_rules")
    .select("*")
    .eq("policy_version_id", policyVersionId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PolicyRule[];
}

export async function screenInventory(inventoryId: string): Promise<ScreeningResult> {
  const { data, error } = await supabase.rpc("screen_my_inventory", {
    p_inventory_id: inventoryId,
  });
  if (error) throw error;
  return data as unknown as ScreeningResult;
}

/**
 * The renter confirming or correcting what an item actually is. This is the
 * only way an item's policy category can change — AI never writes it.
 */
export async function confirmItemPolicy(input: {
  itemId: string;
  policyCategory: string;
  corrected: boolean;
  note?: string;
}): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .update({
      policy_category: input.policyCategory,
      policy_provenance: input.corrected ? "renter_corrected" : "renter_confirmed",
      policy_confirmed_at: new Date().toISOString(),
      policy_note: input.note ?? null,
    })
    .eq("id", input.itemId);
  if (error) throw error;
}

export async function getSuitabilityProfile(spaceId: string): Promise<SuitabilityProfile | null> {
  const { data, error } = await supabase
    .from("space_suitability_profiles")
    .select("*")
    .eq("space_id", spaceId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as unknown as SuitabilityProfile) : null;
}

export async function saveSuitabilityProfile(input: {
  spaceId: string;
  hostId: string;
  attributes: SuitabilityAttributes;
  notes?: string | null;
  declarations: { authority: boolean; compliance: boolean; accuracy: boolean };
  policyVersionId: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const declared =
    input.declarations.authority && input.declarations.compliance && input.declarations.accuracy;
  const { error } = await supabase.from("space_suitability_profiles").upsert(
    {
      space_id: input.spaceId,
      host_id: input.hostId,
      attributes: sanitiseSuitability(input.attributes) as unknown as Json,
      host_notes: input.notes ?? null,
      host_confirmed_at: now,
      declaration_authority: input.declarations.authority,
      declaration_compliance: input.declarations.compliance,
      declaration_accuracy: input.declarations.accuracy,
      declared_at: declared ? now : null,
      declared_policy_version_id: input.policyVersionId,
      updated_at: now,
    },
    { onConflict: "space_id" },
  );
  if (error) throw error;
}

/**
 * Policy lifecycle. Both calls are staff-only and re-check the caller's role
 * inside the database, so a signed-in renter calling them directly is refused.
 */
export async function createPolicyDraft(input: {
  version: string;
  title: string;
  summary?: string;
  sections?: PolicySection[];
  copyRulesFromVersionId?: string | null;
}): Promise<PolicyVersion> {
  const { data, error } = await supabase.rpc("create_policy_draft", {
    p_version: input.version,
    p_title: input.title,
    p_summary: input.summary ?? "",
    p_sections: (input.sections ?? []) as unknown as Json,
    ...(input.copyRulesFromVersionId ? { p_copy_rules_from: input.copyRulesFromVersionId } : {}),
  });
  if (error) throw error;
  return data as unknown as PolicyVersion;
}

export async function publishPolicyVersion(input: {
  versionId: string;
  effectiveAt?: string;
}): Promise<PolicyVersion> {
  const { data, error } = await supabase.rpc("publish_policy_version", {
    p_version_id: input.versionId,
    p_effective_at: input.effectiveAt ?? new Date().toISOString(),
  });
  if (error) throw error;
  return data as unknown as PolicyVersion;
}

/**
 * Public projection of the rules for a published policy version.
 *
 * Signed-out visitors have no read grant on `storage_policy_rules` (rules
 * carry internal reason codes and host-only messages), so the public storage
 * policy page reads through the vetted `get_public_policy_rules` projection
 * instead of the table. This avoids a guaranteed 401 without weakening RLS.
 */
export async function listPublicPolicyRules(policyVersionId: string): Promise<PublicPolicyRule[]> {
  const { data, error } = await supabase.rpc("get_public_policy_rules", {
    p_version_id: policyVersionId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as PublicPolicyRule[];
}
