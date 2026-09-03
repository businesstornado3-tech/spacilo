import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { DiscoveryLink } from "@/lib/discovery/linking";

export function DiscoveryLinkList({ links }: { links: readonly DiscoveryLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label="Related EarnRoom paths" className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <Link
          key={`${link.to}-${link.label}`}
          to={link.to}
          className="group flex min-h-20 items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary-soft"
        >
          <span className="min-w-0">
            <span className="block type-card-title">{link.label}</span>
            <span className="mt-1 block type-body-xs text-muted-foreground">{link.reason}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
