import {
  Camera,
  Bell,
  Lock,
  Fence,
  Lightbulb,
  Droplets,
  Thermometer,
  MoveHorizontal,
  Car,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { SecurityFeature } from "@/types/models";

export const SECURITY_FEATURES: Record<SecurityFeature, { label: string; icon: LucideIcon }> = {
  cctv: { label: "CCTV", icon: Camera },
  alarm: { label: "Alarmed", icon: Bell },
  locked_door: { label: "Lockable", icon: Lock },
  gated: { label: "Gated", icon: Fence },
  lighting: { label: "Lit access", icon: Lightbulb },
  dry: { label: "Dry", icon: Droplets },
  heated: { label: "Heated", icon: Thermometer },
  ground_floor: { label: "Ground floor", icon: MoveHorizontal },
  vehicle_access: { label: "Vehicle access", icon: Car },
  "24_7_access": { label: "24/7 access", icon: Clock },
};

export function SecurityFeatureIcons({
  features,
  max = 4,
  className,
}: {
  features: SecurityFeature[];
  max?: number;
  className?: string;
}) {
  const shown = features.slice(0, max);
  const extra = features.length - shown.length;

  return (
    <ul className={cn("flex items-center gap-2", className)}>
      {shown.map((f) => {
        const { label, icon: Icon } = SECURITY_FEATURES[f];
        return (
          <li key={f} className="flex items-center gap-1 text-muted-foreground" title={label}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
      {extra > 0 ? (
        <li className="type-body-sm text-muted-foreground">+{extra} more</li>
      ) : null}
    </ul>
  );
}
