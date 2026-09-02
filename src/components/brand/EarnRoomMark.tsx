import iconAsset from "@/assets/brand/earnroom-icon-transparent.png.asset.json";
import lockupAsset from "@/assets/brand/earnroom-lockup.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Image components derived directly from the supplied approved artwork.
 * They deliberately do not recreate, recolour or reinterpret its geometry.
 */
export function EarnRoomSymbol({ className }: { className?: string }) {
  return (
    <img
      src={iconAsset.url}
      alt=""
      aria-hidden="true"
      className={cn("size-8 object-contain", className)}
    />
  );
}

export function EarnRoomSymbolCompact({ className }: { className?: string }) {
  return <EarnRoomSymbol {...(className ? { className } : {})} />;
}

export function EarnRoomLockup({
  className,
}: {
  className?: string;
  symbolClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <img
      src={lockupAsset.url}
      alt="EarnRoom — Make space earn."
      className={cn("block h-auto w-full object-contain", className)}
    />
  );
}
