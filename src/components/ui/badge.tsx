import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 type-badge transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        subtle: "border-transparent bg-primary-soft text-primary-soft-foreground",
        neutral: "border-border bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success-soft text-success-soft-foreground",
        warning: "border-transparent bg-warning-soft text-warning-soft-foreground",
        destructive: "border-transparent bg-destructive-soft text-destructive-soft-foreground",
        info: "border-transparent bg-info-soft text-info-soft-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border-strong text-foreground",
      },
      size: {
        default: "",
        sm: "px-2 py-0.5 text-[0.6875rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
