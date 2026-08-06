/** Public listing reads: host trust profile and availability (Prompt 26B). */
import { useQuery } from "@tanstack/react-query";

import {
  fetchPublicHostProfile,
  fetchUnavailableDates,
} from "@/lib/marketplace/listing-public-api";

export function usePublicHostProfile(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["host-profile", spaceId ?? "none"] as const,
    queryFn: () => fetchPublicHostProfile(spaceId as string),
    enabled: Boolean(spaceId),
    staleTime: 5 * 60_000,
  });
}

export function useSpaceAvailability(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["space-availability", spaceId ?? "none"] as const,
    queryFn: () => fetchUnavailableDates(spaceId as string),
    enabled: Boolean(spaceId),
    staleTime: 60_000,
  });
}
