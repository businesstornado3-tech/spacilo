import * as React from "react";

/**
 * True once the client has hydrated. Used to avoid offering interactive
 * actions that would silently do nothing before React has attached handlers.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated;
}
