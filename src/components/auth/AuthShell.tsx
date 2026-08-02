import { Link } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

/** Centred, mobile-first container for authentication screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <MarketingLayout>
      <section
        className={`mx-auto w-full px-4 py-10 sm:px-6 sm:py-16 ${wide ? "max-w-4xl" : "max-w-md"}`}
      >
        <h1 className="type-h1">{title}</h1>
        {subtitle ? (
          <p className="mt-3 max-w-prose type-body text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-8 type-body-sm text-muted-foreground">{footer}</div> : null}
      </section>
    </MarketingLayout>
  );
}

export function AuthFootnote() {
  return (
    <p className="type-body-sm text-muted-foreground">
      By continuing you agree to the {brand.name}{" "}
      <Link to="/trust" className="text-primary underline-offset-4 hover:underline">
        Terms of Service and Privacy Policy
      </Link>
      .
    </p>
  );
}
