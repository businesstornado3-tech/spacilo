import * as React from "react";
import { useRouterState } from "@tanstack/react-router";

import { useAuth } from "@/hooks/useAuth";
import { setAnalyticsUser, trackPageView } from "@/lib/analytics/tracker";

/**
 * Mounts once at the root. Records one page view per client-side navigation
 * and keeps the account attribution up to date.
 *
 * Deliberately renders nothing and does no work beyond a debounced insert —
 * a page view must never trigger AI, vision or model loading.
 */
export function AnalyticsTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user } = useAuth();
  const lastPath = React.useRef<string | null>(null);

  React.useEffect(() => {
    setAnalyticsUser(user?.id ?? null);
  }, [user?.id]);

  React.useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
