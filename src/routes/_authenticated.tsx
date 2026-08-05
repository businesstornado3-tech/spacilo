import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { privateRouteMeta } from "@/lib/seo/meta";

/**
 * Gate for every signed-in area. Client-only because the session lives in
 * browser storage; the server cannot read it.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => privateRouteMeta(),
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
