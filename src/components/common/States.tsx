import { TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="type-h3">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm type-body-sm text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-2xl border border-destructive/25 bg-destructive-soft px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-destructive text-destructive-foreground">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <h3 className="type-h3 text-destructive-soft-foreground">{title}</h3>
      <p className="mt-2 max-w-sm type-body-sm text-destructive-soft-foreground/85">{description}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
