import { TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional quieter follow-up action. */
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  /** Custom actions (e.g. links) rendered instead of the built-in buttons. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "animate-fade flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-card px-6 py-12 text-center",
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
      {actionLabel || action || secondaryLabel ? (
        <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          {actionLabel ? <Button onClick={onAction}>{actionLabel}</Button> : null}
          {action}
          {secondaryLabel ? (
            <Button variant="text" onClick={onSecondaryAction}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
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

interface LoadingStateProps {
  /** Contextual reassurance, e.g. "Finding nearby storage…". */
  label?: string;
  /** Number of skeleton rows to render beneath the label. */
  rows?: number;
  className?: string;
}

/**
 * Contextual loading state.
 *
 * Prefer this over a bare spinner: it tells the user what work is happening
 * and holds the layout with skeleton rows so nothing shifts on arrival.
 */
export function LoadingState({ label = "Loading…", rows = 3, className }: LoadingStateProps) {
  return (
    <div className={cn("animate-fade space-y-3", className)} role="status" aria-live="polite">
      <p className="flex items-center gap-2 type-body-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className="relative flex size-2 shrink-0 items-center justify-center"
        >
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary/50" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        {label}
      </p>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
