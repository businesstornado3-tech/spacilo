import {
  Boxes,
  Lock,
  MapPinOff,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type TrustIndicatorKind =
  | "secure_payment"
  | "digital_inventory"
  | "address_hidden"
  | "cover";

const INDICATORS: Record<TrustIndicatorKind, { label: string; icon: LucideIcon; hint: string }> = {
  secure_payment: {
    label: "Secure payment",
    icon: Lock,
    hint: "Payments are handled by our payment provider — never in cash between strangers.",
  },
  digital_inventory: {
    label: "Digital inventory",
    icon: Boxes,
    hint: "Both sides agree a photographed list of what's stored.",
  },
  address_hidden: {
    label: "Exact address hidden",
    icon: MapPinOff,
    hint: "Only the approximate area is shown until a booking is confirmed.",
  },
  cover: {
    label: "Protection options",
    icon: ShieldCheck,
    hint: "Cover options are explained before you book. Cover is limited, not absolute.",
  },
};

/** Compact inline reassurance chip — quiet, never institutional. */
export function TrustIndicator({
  kind,
  className,
}: {
  kind: TrustIndicatorKind;
  className?: string | undefined;
}) {
  const { label, icon: Icon, hint } = INDICATORS[kind];
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 type-badge text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export function TrustIndicatorRow({
  kinds = ["secure_payment", "digital_inventory", "address_hidden"],
  className,
}: {
  kinds?: TrustIndicatorKind[];
  className?: string | undefined;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {kinds.map((k) => (
        <li key={k}>
          <TrustIndicator kind={k} />
        </li>
      ))}
    </ul>
  );
}

/** Named single-purpose indicators for readability at call sites. */
export const SecurePaymentIndicator = (props: { className?: string }) => (
  <TrustIndicator kind="secure_payment" {...props} />
);
export const DigitalInventoryIndicator = (props: { className?: string }) => (
  <TrustIndicator kind="digital_inventory" {...props} />
);
export const PrivacyIndicator = (props: { className?: string }) => (
  <TrustIndicator kind="address_hidden" {...props} />
);

/** Editorial trust card — for storytelling sections rather than warnings. */
export function TrustCard({
  icon: Icon,
  title,
  children,
  tone = "plain",
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "accent";
  className?: string | undefined;
}) {
  return (
    <article
      className={cn(
        "group rounded-2xl p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised",
        tone === "accent"
          ? "bg-accent-soft text-accent-foreground"
          : "border border-border bg-card",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          tone === "accent" ? "bg-card/70 text-accent-foreground" : "bg-primary-soft text-primary-soft-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 type-card-title">{title}</h3>
      <p className="mt-1.5 type-body-sm text-muted-foreground">{children}</p>
    </article>
  );
}
