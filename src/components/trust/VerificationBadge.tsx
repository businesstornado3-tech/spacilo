import { BadgeCheck, Mail, Phone, IdCard, MapPinHouse, Warehouse, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VerificationType } from "@/types/models";

export type VerificationBadgeType = VerificationType | "generic";

const CONFIG: Record<VerificationBadgeType, { label: string; icon: LucideIcon }> = {
  email: { label: "Email Verified", icon: Mail },
  phone: { label: "Phone Verified", icon: Phone },
  id: { label: "ID Verified", icon: IdCard },
  address: { label: "Address Verified", icon: MapPinHouse },
  space: { label: "Space Verified", icon: Warehouse },
  payment: { label: "Payment Verified", icon: CreditCard },
  generic: { label: "Verified", icon: BadgeCheck },
};

interface VerificationBadgeProps {
  type: VerificationBadgeType;
  /** Renders a muted "not yet completed" state */
  pending?: boolean;
  showLabel?: boolean;
  className?: string;
}

/**
 * Verification badges confirm that a specific check was completed.
 * They intentionally make no claim about safety or character.
 */
export function VerificationBadge({
  type,
  pending = false,
  showLabel = true,
  className,
}: VerificationBadgeProps) {
  const { label, icon: Icon } = CONFIG[type];
  const text = pending ? `${label.replace(" Verified", "")} not verified` : label;

  return (
    <Badge
      variant={pending ? "neutral" : "success"}
      className={cn(pending && "text-muted-foreground", className)}
      title={pending ? `${label} check not completed` : `${label} check completed`}
    >
      <Icon aria-hidden="true" />
      {showLabel ? text : <span className="sr-only">{text}</span>}
    </Badge>
  );
}

export function VerificationBadgeList({
  types,
  className,
}: {
  types: VerificationBadgeType[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {types.map((t) => (
        <li key={t}>
          <VerificationBadge type={t} />
        </li>
      ))}
    </ul>
  );
}

export const VERIFICATION_DISCLAIMER =
  "Verification confirms a check was completed. It does not guarantee safety, condition or conduct.";
