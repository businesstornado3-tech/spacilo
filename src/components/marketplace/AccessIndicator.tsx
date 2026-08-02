import { CalendarClock, Clock, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type AccessLevel = "24_7" | "daytime" | "by_arrangement";

const ACCESS: Record<AccessLevel, { label: string; icon: LucideIcon; hint: string }> = {
  "24_7": { label: "24/7 access", icon: Clock, hint: "Access at any time" },
  daytime: { label: "Daytime access", icon: Sun, hint: "Access during daytime hours" },
  by_arrangement: {
    label: "By arrangement",
    icon: CalendarClock,
    hint: "Arrange access with the host in advance",
  },
};

export function AccessIndicator({
  level,
  compact = false,
  className,
}: {
  level: AccessLevel;
  compact?: boolean;
  className?: string;
}) {
  const { label, icon: Icon, hint } = ACCESS[level];
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full type-badge transition-colors duration-150",
        compact
          ? "text-muted-foreground"
          : "bg-secondary px-2.5 py-1 text-secondary-foreground hover:bg-primary-soft hover:text-primary-soft-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
