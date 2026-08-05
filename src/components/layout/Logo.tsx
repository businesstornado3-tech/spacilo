import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { SpaciloSymbol } from "@/components/brand/SpaciloMark";
import { cn } from "@/lib/utils";

/**
 * Brand lock-up: the geometric Spacilo symbol plus the wordmark.
 * The name is read from the central brand config so the migration is reversible.
 */
export function Logo({
  className,
  to = "/",
}: {
  className?: string;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label={`${brand.name} home`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground">
        <SpaciloSymbol className="size-6" />
      </span>
      <span className="font-display text-[1.125rem] font-bold tracking-[-0.03em] text-foreground">
        {brand.name}
      </span>
    </Link>
  );
}
