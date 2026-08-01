import { CircleCheck, Info, TriangleAlert, CircleX, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "error";

const TONES: Record<AlertTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "bg-info-soft text-info-soft-foreground border-info/25" },
  success: {
    icon: CircleCheck,
    className: "bg-success-soft text-success-soft-foreground border-success/25",
  },
  warning: {
    icon: TriangleAlert,
    className: "bg-warning-soft text-warning-soft-foreground border-warning/30",
  },
  error: {
    icon: CircleX,
    className: "bg-destructive-soft text-destructive-soft-foreground border-destructive/25",
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-4", toneClass, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="type-label">{title}</p>
        {children ? <div className="mt-1 type-body-sm opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
