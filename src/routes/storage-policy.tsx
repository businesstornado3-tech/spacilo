/**
 * The public storage policy.
 *
 * One published version at a time, read straight from the database so the
 * words renters and hosts agree to are the same words the rules enforce.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/common/Skeletons";
import { Alert } from "@/components/common/Alert";
import { useActivePolicy, usePolicyRules } from "@/hooks/usePolicy";
import { DECISION_LABEL } from "@/lib/policy/engine";
import { policyCategoryLabel } from "@/lib/policy/categories";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = "Storage policy — " + brand.name;
const description =
  "What you can and can't store through " +
  brand.name +
  ", how we check items, and what hosts tell you about their space.";

export const Route = createFileRoute("/storage-policy")({
  head: () => ({
    ...publicRouteMeta({ title: title, description: description, path: "/storage-policy" }),
    scripts: [
      jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: title, path: "/storage-policy" }])),
    ],
  }),
  component: StoragePolicyPage,
});

function StoragePolicyPage() {
  const { data: policy, isLoading } = useActivePolicy();
  const { data: rules } = usePolicyRules(policy?.id);

  const groups = [
    { decision: "prohibited", heading: "Never allowed" },
    { decision: "needs_identification", heading: "Must be identified first" },
    { decision: "restricted", heading: "Allowed with care" },
    { decision: "allowed_with_confirmation", heading: "Allowed — with a note" },
    { decision: "allowed", heading: "Allowed" },
  ] as const;

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <Badge variant="subtle">
          <ShieldCheck aria-hidden="true" />
          Trust &amp; safety
        </Badge>
        <h1 className="mt-4 type-h1">{policy?.title ?? "Storage policy"}</h1>
        <p className="mt-3 type-body-lg text-muted-foreground">
          {policy?.summary ?? description}
        </p>
        {policy ? (
          <p className="mt-2 type-body-sm text-muted-foreground">
            Version {policy.version}
            {policy.effective_at
              ? ` · in effect since ${new Date(policy.effective_at).toLocaleDateString("en-GB")}`
              : ""}
          </p>
        ) : null}

        {isLoading ? <Skeleton className="mt-8 h-64 w-full" /> : null}

        {policy?.sections?.length ? (
          <div className="mt-10 space-y-8">
            {policy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="type-h3">{section.heading}</h2>
                <p className="mt-2 type-body text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
        ) : null}

        {rules?.length ? (
          <div className="mt-12 space-y-8">
            <h2 className="type-h2">What the rules say</h2>
            {groups.map((group) => {
              const matching = rules.filter((rule) => rule.decision === group.decision);
              if (matching.length === 0) return null;
              return (
                <section key={group.decision}>
                  <h3 className="type-h3">{group.heading}</h3>
                  <ul className="mt-3 space-y-3">
                    {matching.map((rule) => (
                      <li key={rule.id} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="type-body font-medium">
                            {policyCategoryLabel(rule.category)}
                          </p>
                          <span className="ml-auto type-body-xs text-muted-foreground">
                            {DECISION_LABEL[rule.decision]}
                          </span>
                        </div>
                        <p className="mt-1 type-body-sm text-muted-foreground">
                          {rule.renter_message}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}

        <Alert tone="info" className="mt-12" title="Checks, not guarantees">
          {brand.name} is a marketplace, not an insurer or a licensed storage operator. Screening,
          declarations and Spacilo AI estimates reduce risk — they don&apos;t remove it. Read{" "}
          <Link to="/trust" className="underline underline-offset-2">
            how we build trust
          </Link>{" "}
          for the full picture.
        </Alert>
      </div>
    </MarketingLayout>
  );
}
