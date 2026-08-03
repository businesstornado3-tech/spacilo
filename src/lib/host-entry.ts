/**
 * Single source of truth for where a host entry point ("List your space") sends a user.
 * Both the homepage hero CTA and the /list-space information page use this.
 */
export type HostEntryTarget =
  | { to: "/host/spaces/new" }
  | { to: "/signup"; search: { mode: "host" } };

export function hostEntryTarget(isAuthenticated: boolean): HostEntryTarget {
  return isAuthenticated ? { to: "/host/spaces/new" } : { to: "/signup", search: { mode: "host" } };
}
