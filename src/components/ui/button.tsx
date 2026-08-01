import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg type-nav cursor-pointer transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Primary action */
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary/92",
        /** Secondary action */
        secondary:
          "bg-card text-foreground border border-border-strong shadow-card hover:bg-secondary",
        /** Tertiary / text action */
        text: "text-primary hover:bg-primary-soft",
        outline: "border border-border-strong bg-transparent hover:bg-secondary",
        subtle: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
        success: "bg-success text-success-foreground shadow-card hover:bg-success/92",
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/92",
        ghost: "hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /** 44px — meets touch target guidance */
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, block, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
