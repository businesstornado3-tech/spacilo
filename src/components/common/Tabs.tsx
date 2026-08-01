import * as React from "react";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

/** Accessible tabs with roving keyboard support. */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
  children,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const activeIndex = items.findIndex((i) => i.id === value);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = items[(activeIndex + delta + items.length) % items.length];
    if (next) onValueChange(next.id);
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="inline-flex gap-1 rounded-xl bg-secondary p-1"
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.id)}
              className={cn(
                "min-h-9 rounded-lg px-3.5 type-nav transition-colors",
                selected
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {children ? (
        <div
          role="tabpanel"
          id={`panel-${value}`}
          aria-labelledby={`tab-${value}`}
          className="mt-4"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
