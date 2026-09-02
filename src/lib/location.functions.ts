/**
 * Location — client-callable server functions.
 *
 * Thin wrappers only. Geocoding runs server-side so any future provider
 * credential stays out of the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { geocodeRequestSchema } from "@/lib/location/schema";

/** Public: resolve a renter's search text to a map centre. No auth needed. */
export const geocodeSearchLocation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => geocodeRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { getGeocodingProvider } = await import("@/lib/location/provider.server");
    try {
      const resolution = await getGeocodingProvider().geocodeDetailed(data.query);
      if (!resolution) {
        // Resolution failed — this is NOT the same as a search with no results.
        return {
          ok: false as const,
          reason: "not_found" as const,
          message: "We couldn't find that location. Try a full UK postcode, for example PO4 8LB.",
        };
      }
      if (resolution.alternatives.length > 0) {
        // Fail closed: never search around an arbitrary winner when places
        // elsewhere are equally plausible.
        return {
          ok: false as const,
          reason: "ambiguous" as const,
          message: "We found more than one place with that name. Choose one to search nearby.",
          alternatives: [resolution.centre, ...resolution.alternatives],
        };
      }
      return {
        ok: true as const,
        centre: resolution.centre,
        alternatives: [],
      };
    } catch {
      return {
        ok: false as const,
        reason: "provider_error" as const,
        message: "Location lookup is unavailable right now. Please try again shortly.",
      };
    }
  });

/** Host-only: geocode a space the caller owns. RLS enforces ownership. */
export const geocodeMySpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ spaceId: z.string().uuid(), force: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { geocodeSpaceById } = await import("@/lib/location/geocode.server");
    return geocodeSpaceById(context.supabase, data.spaceId, { force: data.force ?? false });
  });
