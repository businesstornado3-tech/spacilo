import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateSearchParams } from "@/lib/search-params";

/** Legacy entry point — discovery now lives at /search. */
export const Route = createFileRoute("/find-storage")({
  validateSearch: validateSearchParams,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/search", search, replace: true });
  },
});
