/**
 * Admin policy management.
 *
 * Policy content and rules are versioned. A published version can't be edited
 * in place — you draft a new one and publish it — so every request that was
 * ever sent can be read against the exact rules that applied at the time.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/common/Skeletons";
import { Alert } from "@/components/common/Alert";
import { NativeSelect } from "@/components/form/Field";
import { usePolicyRules, usePolicyVersions } from "@/hooks/usePolicy";
import { DECISION_LABEL } from "@/lib/policy/engine";
import { policyCategoryLabel } from "@/lib/policy/categories";
import { PolicyLifecyclePanel } from "@/components/policy/PolicyLifecyclePanel";

const title = "Storage policy admin — " + brand.name;
const description = "Review published and draft storage policy versions and the rules they apply.";

export const Route = createFileRoute("/_authenticated/admin/policy/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PolicyAdminPage,
});

function PolicyAdminPage() {
  const { data: versions, isLoading } = usePolicyVersions();
  const [selected, setSelected] = React.useState<string | null>(null);
  const activeId = selected ?? versions?.[0]?.id;
  const { data: rules } = usePolicyRules(activeId);
  const version = versions?.find((row) => row.id === activeId);

  return (
    <AppLayout mode="renter" title="Storage policy" description={description}>
      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {versions?.length ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="type-label" htmlFor="policy-version">
              Version
            </label>
            <NativeSelect
              id="policy-version"
              className="max-w-xs"
              value={activeId ?? ""}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setSelected(event.target.value)
              }
            >
              {versions.map((row) => (
                <option key={row.id} value={row.id}>
                  v{row.version} — {row.status}
                </option>
              ))}
            </NativeSelect>
            {version ? (
              <Badge variant={version.status === "published" ? "success" : "neutral"}>
                {version.status}
              </Badge>
            ) : null}
          </div>

          {version ? (
            <PolicyLifecyclePanel
              version={version}
              versions={versions}
              activeRuleCount={rules?.length ?? 0}
            />
          ) : null}



          {version ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 type-h3">
                <ScrollText className="size-5 text-primary" aria-hidden="true" />
                {version.title}
              </h2>
              <p className="mt-1 type-body-sm text-muted-foreground">{version.summary}</p>
              <div className="mt-4 space-y-4">
                {version.sections?.map((section) => (
                  <div key={section.heading}>
                    <h3 className="type-label">{section.heading}</h3>
                    <p className="mt-1 type-body-sm text-muted-foreground">{section.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="type-h3">Rules ({rules?.length ?? 0})</h2>
            <ul className="mt-3 space-y-2">
              {rules?.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3"
                >
                  <span className="type-body-sm font-medium">
                    {policyCategoryLabel(rule.category)}
                  </span>
                  <span className="type-body-xs text-muted-foreground">
                    {rule.internal_reason_code}
                  </span>
                  <Badge variant="neutral" size="sm" className="ml-auto">
                    {DECISION_LABEL[rule.decision]}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>

          <Alert tone="info" title="Changing the policy">
            Published versions stay frozen. To change the rules, create a new version and publish
            it — every existing request keeps the version it was screened against.
          </Alert>
        </div>
      ) : null}
    </AppLayout>
  );
}
