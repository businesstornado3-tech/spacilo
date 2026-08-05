/**
 * Staff-only policy lifecycle: draft → review → publish → frozen.
 *
 * Nothing here can change a published version. Publishing is a database
 * action that re-checks the caller is staff, retires the previous version and
 * writes an audit entry, so this panel is a control surface, not the authority.
 */
import * as React from "react";
import { GitBranchPlus, Send } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/overlay/toast";
import { useCreatePolicyDraft, usePublishPolicyVersion } from "@/hooks/usePolicy";
import {
  POLICY_LIFECYCLE_LABEL,
  canPublishPolicy,
  policyLifecycleState,
} from "@/lib/policy/lifecycle";
import type { PolicyVersion } from "@/lib/policy/types";

export function PolicyLifecyclePanel({
  version,
  versions,
  activeRuleCount,
}: {
  version: PolicyVersion;
  versions: PolicyVersion[];
  activeRuleCount: number;
}) {
  const createDraft = useCreatePolicyDraft();
  const publish = usePublishPolicyVersion();
  const [nextVersion, setNextVersion] = React.useState("");
  const state = policyLifecycleState(version, versions);
  const publishable = canPublishPolicy(version, activeRuleCount);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-h3">Lifecycle</h2>
        <Badge variant={state === "active" ? "success" : "neutral"} className="ml-auto">
          {POLICY_LIFECYCLE_LABEL[state]}
        </Badge>
      </div>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Drafts can be edited. Once published, a version is frozen and every request keeps the
        version it was screened against.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-40">
          <label className="type-label" htmlFor="new-policy-version">
            New draft version
          </label>
          <Input
            id="new-policy-version"
            className="mt-1"
            placeholder="1.1.0"
            value={nextVersion}
            onChange={(event) => setNextVersion(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          disabled={createDraft.isPending || nextVersion.trim().length === 0}
          onClick={async () => {
            try {
              await createDraft.mutateAsync({
                version: nextVersion.trim(),
                title: version.title,
                summary: version.summary,
                sections: version.sections,
                copyRulesFromVersionId: version.id,
              });
              setNextVersion("");
              toast.success("Draft created", "Rules were copied from this version.");
            } catch (error) {
              toast.error("Couldn't create the draft", (error as Error).message);
            }
          }}
        >
          <GitBranchPlus className="size-4" aria-hidden="true" />
          Draft from this version
        </Button>

        <Button
          disabled={!publishable || publish.isPending}
          onClick={async () => {
            try {
              await publish.mutateAsync({ versionId: version.id });
              toast.success("Published", `v${version.version} is now in force.`);
            } catch (error) {
              toast.error("Couldn't publish", (error as Error).message);
            }
          }}
        >
          <Send className="size-4" aria-hidden="true" />
          Publish this draft
        </Button>
      </div>

      {version.status === "draft" && activeRuleCount === 0 ? (
        <Alert tone="warning" className="mt-4" title="No active rules">
          A version needs at least one active rule before it can be published.
        </Alert>
      ) : null}

      <Alert tone="info" className="mt-4" title="Legal review required before public launch">
        Policy wording is configurable and has not been through legal review. Publishing changes
        what renters and hosts are asked to accept.
      </Alert>
    </section>
  );
}
