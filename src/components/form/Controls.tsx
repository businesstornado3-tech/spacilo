import * as React from "react";

import { cn } from "@/lib/utils";

/** Checkbox with a large, accessible touch target. */
export function CheckboxField({
  id,
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-1.5", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-[6px] border border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="block type-label">{label}</span>
        {description ? (
          <span className="mt-0.5 block type-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

export function RadioField({
  id,
  name,
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  name: string;
  label: string;
  description?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-1.5", className)}>
      <input
        id={id}
        name={name}
        type="radio"
        className="mt-0.5 size-5 shrink-0 cursor-pointer border border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="block type-label">{label}</span>
        {description ? (
          <span className="mt-0.5 block type-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

/** Switch-style toggle built on a native checkbox for accessibility. */
export function ToggleField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-1.5", className)}>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block type-label">{label}</span>
        {description ? (
          <span className="mt-0.5 block type-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5 rounded-full bg-card shadow-card transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
