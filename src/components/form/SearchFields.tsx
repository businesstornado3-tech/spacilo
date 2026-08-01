import * as React from "react";
import { Search, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlBase } from "@/components/form/Field";
import { isValidUkPostcode, formatUkPostcode } from "@/lib/format";

interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSubmit"> {
  label?: string;
  onSearch?: (value: string) => void;
  buttonLabel?: string;
  className?: string;
}

/** General-purpose search input with an accessible label. */
export function SearchField({
  label = "Search",
  placeholder = "Search",
  onSearch,
  buttonLabel,
  className,
  ...props
}: SearchFieldProps) {
  const id = React.useId();
  const [value, setValue] = React.useState("");

  return (
    <form
      role="search"
      className={cn("flex gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch?.(value);
      }}
    >
      <div className="relative flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={cn(controlBase, "pl-10")}
          {...props}
        />
      </div>
      {buttonLabel ? <Button type="submit">{buttonLabel}</Button> : null}
    </form>
  );
}

interface PostcodeSearchProps {
  label?: string;
  hint?: string;
  buttonLabel?: string;
  onSearch?: (postcode: string) => void;
  className?: string;
}

/** UK postcode entry with format validation and normalisation. */
export function PostcodeSearch({
  label = "Postcode",
  hint,
  buttonLabel = "Find storage",
  onSearch,
  className,
}: PostcodeSearchProps) {
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!isValidUkPostcode(trimmed)) {
      setError("Enter a valid UK postcode, for example PO4 8LB");
      return;
    }
    setError(null);
    const formatted = formatUkPostcode(trimmed);
    setValue(formatted);
    onSearch?.(formatted);
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block type-label">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="type-body-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <MapPin
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={id}
            name="postcode"
            inputMode="text"
            autoComplete="postal-code"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="PO4 8LB"
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(hint && `${id}-hint`, error && `${id}-error`) || undefined}
            className={cn(
              controlBase,
              "pl-10 uppercase tracking-wide",
              error && "border-destructive focus-visible:ring-destructive",
            )}
          />
        </div>
        <Button type="submit" className="sm:w-auto" block>
          {buttonLabel}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="type-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
