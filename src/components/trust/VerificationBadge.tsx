import { BadgeCheck, Mail, Phone, IdCard, MapPinHouse, Warehouse, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VerificationType } from "@/types/models";

export type VerificationBadgeType = VerificationType | "generic" | "host";

const CONFIG: Record<VerificationBadgeType, { label: string; icon: LucideIcon }> = {
  email: { label: "Email Verified", icon: Mail },
  phone: { label: "Phone Verified", icon: Phone },
  id: { label: "ID Verified", icon: IdCard },
  address: { label: "Address Verified", icon: MapPinHouse },
  space: { label: "Verified Space", icon: Warehouse },
  payment: { label: "Payment Verified", icon: CreditCard },
  host: { label: "Verified Host", icon: BadgeCheck },
  generic: { label: "Verified", icon: BadgeCheck },
};

interface VerificationBadgeProps {
  type: VerificationBadgeType;
  /** Renders a muted "not yet completed" state */
  pending?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string | undefined;
}

/**
 * Verification badges confirm that a specific check was completed.
 * Deliberately compact and quiet — they make no claim about safety.
 */
export function VerificationBadge({
  type,
  pending = false,
  showLabel = true,
  size = "md",
  className,
}: VerificationBadgeProps) {
  const { label, icon: Icon } = CONFIG[type];
  const text = pending ? `${label.replace(/\s?Verified\s?/, "")} not verified` : label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full type-badge transition-[background-color,color,transform] duration-150 ease-out hover:-translate-y-px",
        size === "sm" ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-1",
        pending
          ? "bg-secondary text-muted-foreground"
          : "bg-success-soft text-success-soft-foreground hover:bg-success-soft/80",
        className,
      )}
      title={pending ? `${label} check not completed` : `${label} check completed`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {showLabel ? text : <span className="sr-only">{text}</span>}
    </span>
  );
}

export function VerificationBadgeList({
  types,
  className,
}: {
  types: VerificationBadgeType[];
  className?: string | undefined;
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
