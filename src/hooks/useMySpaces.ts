/**
 * React Query wiring for the signed-in host's own spaces.
 *
 * A plain read of canonical rows — no AI, no derived state. Derivation lives in
 * `@/lib/spacefit-hub`.
 */
import { useQuery } from "@tanstack/react-query";

import { listMySpaces, type Space } from "@/lib/spaces-api";

export const mySpacesKey = ["spaces", "mine"] as const;

export function useMySpaces() {
  return useQuery<Space[]>({ queryKey: mySpacesKey, queryFn: listMySpaces });
}
