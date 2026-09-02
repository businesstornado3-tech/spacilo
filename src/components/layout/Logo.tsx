import { Link } from "@tanstack/react-router";

import lockupAsset from "@/assets/brand/earnroom-lockup.png.asset.json";
import wordmarkAsset from "@/assets/brand/earnroom-wordmark-transparent.png.asset.json";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Approved EarnRoom artwork. The compact variant uses the exact icon and
 * wordmark on transparency, with only the source whitespace tightened.
 */
export function Logo({
  className,
  to = "/",
  variant = "compact",
}: {
  className?: string;
  to?: string;
  variant?: "compact" | "full";
}) {
  const asset = variant === "full" ? lockupAsset : wordmarkAsset;
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label={`${brand.name} home`}
    >
      <img
        src={asset.url}
        alt={`${brand.name}${variant === "full" ? ` — ${brand.tagline}` : ""}`}
        className={cn(
          "block w-auto object-contain object-left",
          variant === "full" ? "h-20 sm:h-24" : "h-9 sm:h-10",
        )}
      />
    </Link>
  );
}
