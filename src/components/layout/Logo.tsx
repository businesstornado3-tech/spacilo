import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { EarnRoomSymbol } from "@/components/brand/EarnRoomMark";
import { cn } from "@/lib/utils";

/**
 * Brand lock-up: the approved hexagonal EarnRoom symbol plus the wordmark.
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
        "inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label={`${brand.name} home`}
    >
      <EarnRoomSymbol className="size-9 shrink-0 text-primary" />
      <span className="font-display text-[1.2rem] font-bold tracking-[-0.035em] text-foreground">
        {brand.name}
      </span>
    </Link>
  );
}
