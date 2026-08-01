import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Temporary wordmark for the working brand name.
 * The name is read from the central brand config.
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
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-[10px] bg-primary font-display text-sm font-bold text-primary-foreground"
      >
        {brand.shortName.slice(0, 1)}
      </span>
      <span className="font-display text-[1.0625rem] font-bold tracking-tight text-foreground">
        {brand.name}
      </span>
    </Link>
  );
}
