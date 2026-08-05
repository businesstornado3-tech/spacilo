/**
 * Renter-facing safety check for My Stuff.
 *
 * SpaceFit AI may have suggested what an item is — this panel is where the
 * renter confirms or corrects it. The published storage policy then decides
 * what that means, and the same rules run again on the server before any
 * request is sent, so nothing here can wave an item through.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, CircleCheck, Loader2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/form/Field";
import { useActivePolicy, useConfirmItemPolicy, useInventoryScreening, usePolicyRules } from "@/hooks/usePolicy";
import { DECISION_LABEL, DECISION_TONE, summariseScreening } from "@/lib/policy/engine";
import { policyCategoryLabel } from "@/lib/policy/categories";
import type { ScreenedItem } from "@/lib/policy/types";

const BADGE_VARIANT = {
  success: "success",
  neutral: "neutral",
  warning: "warning",
  danger: "destructive",
} as const;

export function ItemScreeningPanel({ inventoryId }: { inventoryId: string | undefined }) {
  const { data: screening, isLoading } = useInventoryScreening(inventoryId);
  const { data: policy } = useActivePolicy();
  const { data: rules } = usePolicyRules(policy?.id);
  const summary = summariseScreening(screening);

  const categories = React.useMemo(() => {
    const keys = [...new Set((rules ?? []).map((rule) => rule.category))];
    return keys.map((key) => ({ value: key, label: policyCategoryLabel(key) }));
  }, [rules]);

  if (!inventoryId) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 type-h3">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          Storage safety check
        </h2>
        {summary.available ? (
          <Badge
            variant={summary.blocked ? "destructive" : summary.actionRequired ? "warning" : "success"}
            className="ml-auto"
          >
            {summary.headline}
          </Badge>
        ) : null}
      </div>

      <p className="mt-1 type-body-sm text-muted-foreground">
        We check what you&apos;ve listed against our{" "}
        <Link to="/storage-policy" className="underline underline-offset-2">
          storage policy
        </Link>
        . You decide what each item actually is — we only apply the rules.
      </p>

      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 type-body-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking your items…
        </p>
      ) : null}

      {!isLoading && !summary.available ? (
        <Alert tone="warning" className="mt-4" title="We can't run the check right now">
          Please try again shortly. You&apos;ll need to pass this check before sending a request.
        </Alert>
      ) : null}

      {summary.blocked ? (
        <Alert tone="error" className="mt-4" title="Some items can't be stored">
          Remove or correct these before you can send a storage request.
        </Alert>
      ) : null}

      {summary.available && summary.clear && summary.items.length > 0 ? (
        <p className="mt-4 flex items-center gap-2 type-body-sm text-success">
          <CircleCheck className="size-4" aria-hidden="true" />
          Nothing here needs your attention.
        </p>
      ) : null}

      {summary.prohibited.length > 0 || summary.needsAction.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {[...summary.prohibited, ...summary.needsAction].map((item) => (
            <ScreenedItemRow
              key={item.item_id}
              item={item}
              inventoryId={inventoryId}
              categories={categories}
            />
          ))}
        </ul>
      ) : null}

      {summary.policyVersion ? (
        <p className="mt-4 type-body-xs text-muted-foreground">
          Storage policy v{summary.policyVersion}. Checks reduce risk — they aren&apos;t a
          guarantee.
        </p>
      ) : null}
    </section>
  );
}

function ScreenedItemRow({
  item,
  inventoryId,
  categories,
}: {
  item: ScreenedItem;
  inventoryId: string;
  categories: { value: string; label: string }[];
}) {
  const confirm = useConfirmItemPolicy(inventoryId);
  const [correcting, setCorrecting] = React.useState(false);
  const [choice, setChoice] = React.useState(item.policy_category);
  const tone = DECISION_TONE[item.decision];

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="type-body font-medium">{item.label}</p>
        <Badge variant={BADGE_VARIANT[tone]} size="sm" className="ml-auto">
          {DECISION_LABEL[item.decision]}
        </Badge>
      </div>
      <p className="mt-1 type-body-sm text-muted-foreground">
        Recorded as {policyCategoryLabel(item.policy_category)}
        {item.provenance === "ai_proposed" ? " (suggested by SpaceFit AI)" : ""}.
      </p>
      {item.message ? <p className="mt-2 type-body-sm">{item.message}</p> : null}

      {correcting ? (
        <div className="mt-3 space-y-2">
          <Select
            aria-label={`What is ${item.label}?`}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate(
                  { itemId: item.item_id, policyCategory: choice, corrected: true },
                  { onSuccess: () => setCorrecting(false) },
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.decision !== "prohibited" ? (
            <Button
              size="sm"
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  itemId: item.item_id,
                  policyCategory: item.policy_category,
                  corrected: false,
                })
              }
            >
              Yes, that&apos;s right
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>
            It&apos;s something else
          </Button>
        </div>
      )}
    </li>
  );
}
