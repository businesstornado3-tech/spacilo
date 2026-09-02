import { Link } from "@tanstack/react-router";

import iconAsset from "@/assets/brand/earnroom-icon.png.asset.json";
import lockupAsset from "@/assets/brand/earnroom-lockup.png.asset.json";
import wordmarkAsset from "@/assets/brand/earnroom-wordmark-transparent.png.asset.json";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Approved EarnRoom artwork. The compact variant uses the exact icon and
 * wordmark on transparency, with only the source whitespace tightened.
 * The header variant keeps the approved icon intact and renders the brand
 * name in the established display face for responsive optical balance.
 */
export function Logo({
  className,
  to = "/",
  variant = "compact",
}: {
  className?: string;
  to?: string;
  variant?: "compact" | "full" | "header";
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
      {variant === "header" ? (
        <span className="inline-flex h-10 items-center gap-2 sm:gap-3" aria-hidden="true">
          <img
            src={iconAsset.url}
            alt=""
            className="size-7 shrink-0 object-contain sm:size-9"
          />
          <span className="type-display text-lg font-[750] leading-none tracking-normal sm:text-[1.375rem]">
            <span className="text-ink">Earn</span>
            <span className="text-primary">Room</span>
          </span>
        </span>
      ) : (
        <img
          src={asset.url}
          alt={`${brand.name}${variant === "full" ? ` — ${brand.tagline}` : ""}`}
          className={cn(
            "block w-auto object-contain object-left",
            variant === "full" ? "h-20 sm:h-24" : "h-9 sm:h-10",
          )}
        />
      )}
    </Link>
  );
}
