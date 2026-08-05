/**
 * The declarations a renter signs before a storage request can be sent.
 *
 * These are the renter's own statements about their belongings. The server
 * re-checks the policy version and refuses the request unless all three are
 * confirmed, so ticking boxes here is a record, not a shortcut.
 */
import { Link } from "@tanstack/react-router";
import { FileCheck } from "lucide-react";

import { CheckboxField } from "@/components/form/Controls";
import { Alert } from "@/components/common/Alert";
import type { RenterDeclaration } from "@/lib/policy/types";

export function RenterDeclarations({
  policyVersion,
  value,
  onChange,
  showError,
}: {
  policyVersion: string | null;
  value: RenterDeclaration;
  onChange: (next: RenterDeclaration) => void;
  showError?: boolean;
}) {
  const set = (patch: Partial<RenterDeclaration>) =>
    onChange({ ...value, ...patch, policy_version: policyVersion ?? "" });

  const complete = value.accurate && value.no_prohibited_items && value.accepts_policy;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 type-h3">
        <FileCheck className="size-5 text-primary" aria-hidden="true" />
        Before you send
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Your host is letting a room in their home, not running a storage depot. Please confirm:
      </p>

      <div className="mt-3 space-y-1">
        <CheckboxField
          id="declare-accurate"
          label="My list is accurate"
          description="What I've added to My Stuff is what I'll actually be storing."
          checked={value.accurate}
          onChange={(event) => set({ accurate: event.target.checked })}
        />
        <CheckboxField
          id="declare-prohibited"
          label="Nothing prohibited"
          description="I'm not storing fuel, gas, explosives, weapons, controlled substances, waste or living things."
          checked={value.no_prohibited_items}
          onChange={(event) => set({ no_prohibited_items: event.target.checked })}
        />
        <CheckboxField
          id="declare-policy"
          label="I accept the storage policy"
          description="I've read what can and can't be stored, and I'll keep to it."
          checked={value.accepts_policy}
          onChange={(event) => set({ accepts_policy: event.target.checked })}
        />
      </div>

      <p className="mt-3 type-body-xs text-muted-foreground">
        <Link to="/storage-policy" className="underline underline-offset-2">
          Read the storage policy
        </Link>
        {policyVersion ? ` (v${policyVersion})` : ""}. We record your confirmation with the request.
      </p>

      {showError && !complete ? (
        <Alert tone="warning" className="mt-4" title="Please confirm all three">
          We can&apos;t send your request until each statement is ticked.
        </Alert>
      ) : null}
    </section>
  );
}

export function emptyDeclaration(policyVersion: string | null): RenterDeclaration {
  return {
    policy_version: policyVersion ?? "",
    accurate: false,
    no_prohibited_items: false,
    accepts_policy: false,
  };
}
