/**
 * Shared host entry CTA. Every "list your space" button on the homepage routes
 * through `hostEntryTarget`, so there is only one host onboarding path.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { hostEntryTarget } from "@/lib/host-entry";
import { track } from "@/lib/analytics/tracker";

interface HostEntryButtonProps {
  label?: string;
  from: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "secondary" | "outline" | "ghost" | "subtle";
  block?: boolean;
  className?: string;
  withArrow?: boolean;
}

export function HostEntryButton({
  label = "List your space",
  from,
  size = "lg",
  variant,
  block = false,
  className,
  withArrow = true,
}: HostEntryButtonProps) {
  const { user } = useAuth();
  const target = hostEntryTarget(Boolean(user));
  const arrow = withArrow ? <ArrowRight className="size-4" aria-hidden="true" /> : null;

  return (
    <Button
      asChild
      size={size}
      {...(variant ? { variant } : {})}
      {...(block ? { block: true } : {})}
      {...(className ? { className } : {})}
      onClick={() => track("cta_clicked", { props: { cta: "list_space", from } })}
    >
      {target.to === "/host/spaces/new" ? (
        <Link to="/host/spaces/new">
          {label}
          {arrow}
        </Link>
      ) : (
        <Link to="/signup" search={{ mode: "host" }}>
          {label}
          {arrow}
        </Link>
      )}
    </Button>
  );
}
