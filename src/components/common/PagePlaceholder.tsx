import { Hammer } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Placeholder used while route structure exists but the feature
 * has not been built yet.
 */
export function PagePlaceholder({
  title,
  description,
  planned = [],
}: {
  title: string;
  description: string;
  planned?: string[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-card p-6 sm:p-8">
      <Badge variant="neutral">
        <Hammer aria-hidden="true" />
        Coming next
      </Badge>
      <h2 className="mt-4 type-h2">{title}</h2>
      <p className="mt-2 max-w-prose type-body text-muted-foreground">{description}</p>
      {planned.length > 0 ? (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {planned.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-border bg-surface px-3 py-2 type-body-sm text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
