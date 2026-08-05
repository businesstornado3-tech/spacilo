/**
 * Storage policy lifecycle — deterministic, pure.
 *
 * A policy version is authored as a draft, published with an effective date,
 * and then frozen. The same resolution rule runs here and in the database
 * (`stow_active_policy_version`): the published version with the most recent
 * effective date that has already come into force. Drafts and future-dated
 * versions are never active, and retired versions stay readable so a booking
 * made months ago can still be read against the rules that applied then.
 */
import type { PolicyVersion } from "@/lib/policy/types";

export type PolicyLifecycleState = "draft" | "scheduled" | "active" | "superseded" | "retired";

/** The one version in force at `now`, or null when nothing is published yet. */
export function resolveActivePolicy(
  versions: PolicyVersion[] | null | undefined,
  now: Date = new Date(),
): PolicyVersion | null {
  const inForce = (versions ?? []).filter(
    (version) =>
      version.status === "published" &&
      version.effective_at !== null &&
      new Date(version.effective_at).getTime() <= now.getTime(),
  );
  if (inForce.length === 0) return null;
  return inForce.reduce((best, candidate) =>
    new Date(candidate.effective_at!).getTime() > new Date(best.effective_at!).getTime()
      ? candidate
      : best,
  );
}

export function policyLifecycleState(
  version: PolicyVersion,
  versions: PolicyVersion[],
  now: Date = new Date(),
): PolicyLifecycleState {
  if (version.status === "draft") return "draft";
  if (version.status === "retired") return "retired";
  if (!version.effective_at || new Date(version.effective_at).getTime() > now.getTime())
    return "scheduled";
  return resolveActivePolicy(versions, now)?.id === version.id ? "active" : "superseded";
}

/** Only drafts may be edited — published wording must never change meaning. */
export function isPolicyEditable(version: PolicyVersion): boolean {
  return version.status === "draft";
}

export function canPublishPolicy(version: PolicyVersion, activeRuleCount: number): boolean {
  return version.status === "draft" && activeRuleCount > 0;
}

/** Without an in-force policy nothing may be waved through. */
export function policyGate(active: PolicyVersion | null): {
  ok: boolean;
  reason: "no_active_policy" | null;
  message: string;
} {
  if (!active)
    return {
      ok: false,
      reason: "no_active_policy",
      message: "We can't check the storage policy right now. Please try again shortly.",
    };
  return { ok: true, reason: null, message: "" };
}

export const POLICY_LIFECYCLE_LABEL: Record<PolicyLifecycleState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "In force",
  superseded: "Superseded",
  retired: "Retired",
};
