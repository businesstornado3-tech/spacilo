/**
 * Storage safety — production verification.
 *
 * These tests hold the line on the principle the whole layer rests on:
 * AI observes, users confirm, policy rules decide, and the server enforces.
 * Anything a renter or host does in the browser is a claim; the database is
 * the authority. Where a guarantee would be dishonest we assert we never
 * make one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  compatibilityOutcome,
  declarationComplete,
  evaluateCompatibility,
  requestReadiness,
  summariseScreening,
  suitabilityMismatches,
} from "@/lib/policy/engine";
import {
  canPublishPolicy,
  isPolicyEditable,
  policyGate,
  policyLifecycleState,
  resolveActivePolicy,
} from "@/lib/policy/lifecycle";
import { applyObservations, pendingProposals, publicObservationView } from "@/lib/policy/observations";
import { SUITABILITY_KEYS, answeredCount, sanitiseSuitability } from "@/lib/policy/suitability";
import type {
  PolicyRule,
  PolicyVersion,
  RenterDeclaration,
  ScreenedItem,
  ScreeningResult,
} from "@/lib/policy/types";

/* ---------------------------------------------------------------- fixtures */

function version(overrides: Partial<PolicyVersion> & { id: string }): PolicyVersion {
  return {
    version: "1.0.0",
    status: "published",
    title: "Storage policy",
    summary: "",
    sections: [],
    effective_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<ScreenedItem> & { item_id: string }): ScreenedItem {
  return {
    label: "Boxes",
    policy_category: "household_general",
    decision: "allowed",
    reason_code: "ok",
    message: "",
    requires_confirmation: false,
    requires_staff_review: false,
    confirmed: true,
    provenance: "renter_confirmed",
    ...overrides,
  };
}

function screening(items: ScreenedItem[], overrides: Partial<ScreeningResult> = {}): ScreeningResult {
  return { ok: true, policy_version: "1.0.0", items, ...overrides };
}

const rule = (overrides: Partial<PolicyRule> & { category: string }): PolicyRule => ({
  id: overrides.category,
  rule_key: overrides.category,
  decision: "allowed",
  severity: 1,
  requires_user_confirmation: false,
  requires_staff_review: false,
  renter_message: "Check with your host.",
  host_message: null,
  internal_reason_code: "reason",
  required_space_attributes: {},
  sort_order: 1,
  ...overrides,
});

const goodDeclaration: RenterDeclaration = {
  policy_version: "1.0.0",
  accurate: true,
  no_prohibited_items: true,
  accepts_policy: true,
};

const MIGRATIONS = (() => {
  const dir = join(process.cwd(), "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
})();

/* ------------------------------------------------------- policy versioning */

describe("policy versioning", () => {
  const drafted = version({ id: "draft", status: "draft", version: "1.1.0", effective_at: null });
  const older = version({ id: "v1", version: "1.0.0", effective_at: "2026-01-01T00:00:00.000Z" });
  const newer = version({ id: "v2", version: "1.1.0", effective_at: "2026-03-01T00:00:00.000Z" });
  const future = version({ id: "v3", version: "2.0.0", effective_at: "2026-09-01T00:00:00.000Z" });
  const retired = version({ id: "v0", status: "retired", effective_at: "2025-01-01T00:00:00.000Z" });
  const all = [drafted, older, newer, future, retired];
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("resolves the most recent published version already in force", () => {
    expect(resolveActivePolicy(all, now)?.id).toBe("v2");
  });

  it("never activates a draft or a future-dated version", () => {
    expect(resolveActivePolicy([drafted, future], now)).toBeNull();
  });

  it("keeps superseded and retired versions readable for historical requests", () => {
    expect(policyLifecycleState(older, all, now)).toBe("superseded");
    expect(policyLifecycleState(retired, all, now)).toBe("retired");
    expect(policyLifecycleState(newer, all, now)).toBe("active");
    expect(policyLifecycleState(future, all, now)).toBe("scheduled");
  });

  it("only allows drafts to be edited", () => {
    expect(isPolicyEditable(drafted)).toBe(true);
    expect(isPolicyEditable(newer)).toBe(false);
    expect(isPolicyEditable(retired)).toBe(false);
  });

  it("refuses to publish a draft with no rules", () => {
    expect(canPublishPolicy(drafted, 0)).toBe(false);
    expect(canPublishPolicy(drafted, 3)).toBe(true);
    expect(canPublishPolicy(newer, 3)).toBe(false);
  });

  it("fails closed when nothing is published", () => {
    expect(policyGate(null).ok).toBe(false);
    expect(policyGate(null).reason).toBe("no_active_policy");
    expect(policyGate(newer).ok).toBe(true);
  });
});

/* --------------------------------------------------------- renter screening */

describe("renter item screening", () => {
  it("treats an unavailable screening as not clear rather than clear", () => {
    const summary = summariseScreening({ ok: false, reason: "no_active_policy" });
    expect(summary.available).toBe(false);
    expect(summary.clear).toBe(false);
  });

  it("blocks on a prohibited item regardless of everything else", () => {
    const summary = summariseScreening(
      screening([item({ item_id: "a" }), item({ item_id: "b", decision: "prohibited" })]),
    );
    expect(summary.blocked).toBe(true);
    expect(summary.clear).toBe(false);
    expect(summary.headline).toContain("can't be stored");
  });

  it("asks the renter to identify unknown items instead of guessing", () => {
    const summary = summariseScreening(
      screening([
        item({ item_id: "a", decision: "needs_identification", confirmed: false, provenance: "ai_proposed" }),
      ]),
    );
    expect(summary.actionRequired).toBe(true);
    expect(summary.needsAction).toHaveLength(1);
  });

  it("counts an unconfirmed AI proposal as outstanding", () => {
    const summary = summariseScreening(
      screening([
        item({
          item_id: "a",
          decision: "allowed_with_confirmation",
          requires_confirmation: true,
          confirmed: false,
          provenance: "ai_proposed",
        }),
      ]),
    );
    expect(summary.clear).toBe(false);
  });

  it("clears once every item is confirmed", () => {
    const summary = summariseScreening(screening([item({ item_id: "a" }), item({ item_id: "b" })]));
    expect(summary.clear).toBe(true);
    expect(summary.blocked).toBe(false);
  });
});

/* ------------------------------------------------------ renter declarations */

describe("renter declarations", () => {
  it("requires all three statements", () => {
    expect(declarationComplete({ ...goodDeclaration, accurate: false }, "1.0.0")).toBe(false);
    expect(declarationComplete({ ...goodDeclaration, no_prohibited_items: false }, "1.0.0")).toBe(false);
    expect(declarationComplete({ ...goodDeclaration, accepts_policy: false }, "1.0.0")).toBe(false);
    expect(declarationComplete(goodDeclaration, "1.0.0")).toBe(true);
  });

  it("rejects a declaration signed against a superseded policy version", () => {
    expect(declarationComplete(goodDeclaration, "1.1.0")).toBe(false);
  });

  it("rejects a missing declaration or a missing policy", () => {
    expect(declarationComplete(null, "1.0.0")).toBe(false);
    expect(declarationComplete(goodDeclaration, null)).toBe(false);
  });
});

/* ---------------------------------------------------- compatibility engine */

describe("compatibility engine", () => {
  const rules = [
    rule({ category: "documents", required_space_attributes: { damp_risk: "low" } }),
    rule({ category: "electronics", required_space_attributes: { damp_risk: "low", weatherproof: "yes" } }),
  ];
  const dryAndDry = { damp_risk: "low", weatherproof: "yes" };

  it("is deterministic — the same input gives the same report", () => {
    const input = {
      screening: screening([item({ item_id: "a", policy_category: "documents" })]),
      rules,
      suitability: dryAndDry,
      spaceFit: { score: 80, compatible: true },
    };
    expect(evaluateCompatibility(input)).toEqual(evaluateCompatibility(input));
  });

  it("explains a suitability mismatch by attribute and item, not by score", () => {
    const mismatches = suitabilityMismatches(
      [item({ item_id: "a", label: "Paperwork", policy_category: "documents" })],
      rules,
      { damp_risk: "high" },
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.attribute).toBe("damp_risk");
    expect(mismatches[0]!.itemLabels).toEqual(["Paperwork"]);
  });

  it("groups several items behind one attribute mismatch", () => {
    const mismatches = suitabilityMismatches(
      [
        item({ item_id: "a", label: "Paperwork", policy_category: "documents" }),
        item({ item_id: "b", label: "Laptop", policy_category: "electronics" }),
      ],
      rules,
      { damp_risk: "high", weatherproof: "yes" },
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.itemLabels).toEqual(["Paperwork", "Laptop"]);
  });

  it("says so plainly when the host hasn't described the space", () => {
    const report = evaluateCompatibility({
      screening: screening([item({ item_id: "a" })]),
      rules,
      suitability: null,
      spaceFit: { score: 90, compatible: true },
    });
    expect(report.suitability.status).toBe("compatible_with_care");
    expect(report.suitability.reasons).toContain("suitability_unknown");
  });

  it("lets a policy block outrank a perfect physical fit", () => {
    const result = screening([item({ item_id: "a", decision: "prohibited" })]);
    const report = evaluateCompatibility({
      screening: result,
      rules,
      suitability: dryAndDry,
      spaceFit: { score: 100, compatible: true },
    });
    expect(report.overall).toBe("not_compatible");
    expect(compatibilityOutcome(report, summariseScreening(result)).outcome).toBe("blocked_by_policy");
  });

  it("reports a strong match only when all three dimensions are clean", () => {
    const result = screening([item({ item_id: "a", policy_category: "documents" })]);
    const report = evaluateCompatibility({
      screening: result,
      rules,
      suitability: dryAndDry,
      spaceFit: { score: 90, compatible: true },
    });
    expect(compatibilityOutcome(report, summariseScreening(result)).outcome).toBe("strong_match");
  });
});

/* --------------------------------------------------------- request gating */

describe("request readiness", () => {
  const clean = screening([item({ item_id: "a" })]);
  const report = evaluateCompatibility({
    screening: clean,
    rules: [],
    suitability: { damp_risk: "low" },
    spaceFit: { score: 90, compatible: true },
  });

  it("allows a request when nothing is outstanding", () => {
    const readiness = requestReadiness({
      screening: clean,
      declaration: goodDeclaration,
      policyVersion: "1.0.0",
      report,
    });
    expect(readiness).toEqual({ ready: true, blockers: [] });
  });

  it("blocks when screening is unavailable rather than assuming it passed", () => {
    const readiness = requestReadiness({
      screening: { ok: false },
      declaration: goodDeclaration,
      policyVersion: "1.0.0",
      report,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain("screening_unavailable");
  });

  it("blocks on prohibited items, pending items and an incomplete declaration", () => {
    const readiness = requestReadiness({
      screening: screening([
        item({ item_id: "a", decision: "prohibited" }),
        item({ item_id: "b", decision: "needs_identification", confirmed: false }),
      ]),
      declaration: { ...goodDeclaration, accepts_policy: false },
      policyVersion: "1.0.0",
      report,
    });
    expect(readiness.blockers).toEqual(
      expect.arrayContaining(["prohibited_items", "items_need_action", "declaration_incomplete"]),
    );
  });

  it("blocks when no policy is in force", () => {
    const readiness = requestReadiness({
      screening: clean,
      declaration: goodDeclaration,
      policyVersion: null,
      report,
    });
    expect(readiness.blockers).toContain("no_active_policy");
  });
});

/* ------------------------------------------------- suitability provenance */

describe("host suitability and provenance", () => {
  it("drops unknown keys and unknown answers so a stale client can't widen the profile", () => {
    const cleaned = sanitiseSuitability({ damp_risk: "low", made_up_key: "yes", ventilation: "maybe" });
    expect(Object.keys(cleaned).sort()).toEqual([...SUITABILITY_KEYS].sort());
    expect(cleaned["ventilation"]).toBe("unknown");
    expect(cleaned["damp_risk"]).toBe("low");
  });

  it("keeps 'not sure' visible rather than counting it as answered", () => {
    expect(answeredCount({ damp_risk: "low", ventilation: "unknown" })).toBe(1);
  });

  it("never promotes an AI proposal into the host's answers", () => {
    const merged = applyObservations(sanitiseSuitability({}), [
      { observation_key: "ventilation", observation: "yes", confidence: 0.99, verification_state: "ai_proposed" },
      { observation_key: "lockable", observation: "yes", confidence: 0.4, verification_state: "host_rejected" },
    ]);
    expect(merged["ventilation"]).toBe("unknown");
    expect(merged["lockable"]).toBe("unknown");
  });

  it("accepts an observation once the host has confirmed or corrected it", () => {
    const merged = applyObservations(sanitiseSuitability({}), [
      { observation_key: "ventilation", observation: "yes", confidence: 0.5, verification_state: "host_confirmed" },
      { observation_key: "damp_risk", observation: "seasonal", confidence: null, verification_state: "host_corrected" },
    ]);
    expect(merged["ventilation"]).toBe("yes");
    expect(merged["damp_risk"]).toBe("seasonal");
  });

  it("surfaces proposals the host still has to look at", () => {
    const proposals = pendingProposals([
      { observation_key: "pets", observation: "yes", confidence: 0.7, verification_state: "ai_proposed" },
      { observation_key: "smoking", observation: "no", confidence: 0.7, verification_state: "host_confirmed" },
    ]);
    expect(proposals.map((p) => p.observation_key)).toEqual(["pets"]);
  });

  it("never exposes AI confidence to the other party", () => {
    const view = publicObservationView({
      observation_key: "pets",
      observation: "yes",
      confidence: 0.91,
      verification_state: "host_confirmed",
    });
    expect(Object.keys(view)).not.toContain("confidence");
  });
});

/* --------------------------------------------------- server-side authority */

describe("server enforcement (migration invariants)", () => {
  it("re-screens the inventory inside create_storage_request", () => {
    expect(MIGRATIONS).toContain("stow_screen_inventory");
    expect(/create or replace function public\.create_storage_request/i.test(MIGRATIONS)).toBe(true);
  });

  it("snapshots the policy version onto the request so it stays readable later", () => {
    expect(MIGRATIONS).toMatch(/policy_version_id/);
    expect(MIGRATIONS).toMatch(/screening_snapshot|policy_snapshot/);
  });

  it("refuses to publish a space without the host's three declarations", () => {
    expect(MIGRATIONS).toContain("declaration_authority");
    expect(MIGRATIONS).toContain("declaration_compliance");
    expect(MIGRATIONS).toContain("declaration_accuracy");
    expect(MIGRATIONS).toMatch(/spaces_validate_publish/);
  });

  it("freezes published policy versions and their rules with guards", () => {
    expect(MIGRATIONS).toMatch(/storage_policy_versions_guard/);
    expect(MIGRATIONS).toMatch(/storage_policy_rules_guard/);
  });

  it("enables row level security on every safety table", () => {
    for (const table of [
      "storage_policy_versions",
      "storage_policy_rules",
      "space_suitability_profiles",
      "policy_acceptances",
      "policy_audit_events",
    ]) {
      expect(MIGRATIONS).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
  });

  it("grants the Data API roles explicitly rather than relying on defaults", () => {
    expect(MIGRATIONS).toMatch(/grant select on public\.storage_policy_versions to anon/i);
    expect(MIGRATIONS).toMatch(/grant .*on public\.space_suitability_profiles to authenticated/i);
  });

  it("pins a safe search_path on security definer routines", () => {
    const definers = MIGRATIONS.match(/security definer/gi) ?? [];
    const paths = MIGRATIONS.match(/set search_path/gi) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });

  it("keeps policy lifecycle RPCs away from anonymous callers", () => {
    expect(MIGRATIONS).toMatch(/revoke execute on function public\.create_policy_draft/i);
    expect(MIGRATIONS).toMatch(/revoke execute on function public\.publish_policy_version/i);
  });
});

/* ------------------------------------------------------------ honest copy */

describe("honest language", () => {
  const files = [
    "src/lib/policy/engine.ts",
    "src/lib/policy/lifecycle.ts",
    "src/lib/policy/observations.ts",
    "src/components/policy/ItemScreeningPanel.tsx",
    "src/components/policy/RenterDeclarations.tsx",
    "src/components/policy/SuitabilitySummary.tsx",
    "src/components/policy/PolicyLifecyclePanel.tsx",
  ].map((path) => readFileSync(join(process.cwd(), path), "utf8"));

  it("never promises safety, insurance or zero risk", () => {
    for (const contents of files) {
      expect(contents).not.toMatch(/100% safe|fully insured|guaranteed safe|zero risk/i);
    }
  });

  it("never has the client decide legality", () => {
    for (const contents of files) {
      expect(contents).not.toMatch(/\bis illegal\b|\bcriminal\b/i);
    }
  });
});
