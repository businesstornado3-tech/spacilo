import { Link } from "@tanstack/react-router";

import iconAsset from "@/assets/brand/earnroom-icon-transparent.png.asset.json";
import lockupAsset from "@/assets/brand/earnroom-lockup.png.asset.json";
import wordmarkAsset from "@/assets/brand/earnroom-wordmark-transparent.png.asset.json";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

type BrandMarkVariant = "header" | "footer";

function EarnRoomBrandMark({ variant }: { variant: BrandMarkVariant }) {
  const isFooter = variant === "footer";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap",
        isFooter ? "gap-3 sm:gap-3.5" : "gap-2.5 sm:gap-3.5",
      )}
      aria-hidden="true"
    >
      <img
        src={iconAsset.url}
        alt=""
        className={cn(
          "block h-auto w-auto shrink-0 object-contain",
          isFooter ? "max-h-11 sm:max-h-12" : "max-h-9 sm:max-h-10",
        )}
      />
      <span
        className={cn(
          "font-display font-[750] leading-none tracking-normal",
          isFooter ? "text-[1.625rem] sm:text-[1.75rem]" : "text-[1.375rem] sm:text-[1.625rem]",
        )}
      >
        <span className="text-ink">Earn</span>
        <span className="text-primary">Room</span>
      </span>
    </span>
  );
}

/**
 * Approved EarnRoom artwork. The compact variant uses the exact icon and
 * wordmark on transparency, with only the source whitespace tightened.
 * Header and footer variants keep the approved icon at its intrinsic aspect
 * ratio and render the brand name separately for responsive optical balance.
 */
export function Logo({
  className,
  to = "/",
  variant = "compact",
}: {
  className?: string;
  to?: string;
  variant?: "compact" | "full" | BrandMarkVariant;
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
      {variant === "header" || variant === "footer" ? (
        <EarnRoomBrandMark variant={variant} />
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
