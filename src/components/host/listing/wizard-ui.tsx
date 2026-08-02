import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Big, tappable icon card used for single-choice questions. */
export function SelectableCard({
  label,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary-soft shadow-card"
          : "border-border bg-card hover:border-border-strong hover:shadow-card",
      )}
    >
      {Icon ? (
        <Icon
          className={cn("size-6", selected ? "text-primary" : "text-muted-foreground")}
        />
      ) : null}
      <span className={cn("type-label", selected && "text-primary-soft-foreground")}>{label}</span>
    </button>
  );
}

/** Full-width option with supporting copy — for the important either/or questions. */
export function OptionRow({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-border-strong",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block type-label">{title}</span>
        {description ? (
          <span className="mt-1 block type-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

/** Multi-select chip. */
export function ChipToggle({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 type-body-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-border bg-card text-foreground hover:border-border-strong",
      )}
    >
      {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

export function StepHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="type-h2">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-prose type-body text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

export function Fieldset({
  legend,
  hint,
  children,
  className,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("mt-8 first:mt-0", className)}>
      <legend className="type-label">{legend}</legend>
      {hint ? <p className="mt-1 type-body-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}
