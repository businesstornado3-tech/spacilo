/**
 * Spacilo AI host space scan — client-callable server functions.
 *
 * Thin wrappers only. Photo bytes and provider credentials never leave the
 * server, and every call is authenticated so a host can only scan and update
 * their own space.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_SPACE_SCAN_PHOTOS } from "@/lib/spacefit-vision/space-schema";

const scanInput = z.object({
  spaceId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()).min(1).max(MAX_SPACE_SCAN_PHOTOS),
  clientRequestId: z.string().uuid().optional(),
});

export const scanSpacePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scanInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runSpaceScan, SpaceScanError } = await import(
      "@/lib/spacefit-vision/space-analyse.server"
    );
    const { VISION_ERROR_MESSAGES } = await import("@/lib/spacefit-vision/schema");

    try {
      const summary = await runSpaceScan({
        supabase: context.supabase,
        userId: context.userId,
        spaceId: data.spaceId,
        photoIds: data.photoIds,
        clientRequestId: data.clientRequestId ?? null,
      });
      return { ok: true as const, ...summary };
    } catch (error) {
      if (error instanceof SpaceScanError) {
        const category = error.category;
        const message =
          category === "forbidden"
            ? "That space isn't available."
            : category === "invalid_request"
              ? "Add at least one photo of your space to scan."
              : VISION_ERROR_MESSAGES[category];
        return { ok: false as const, errorCategory: category, message };
      }
      console.error("[spacefit-space] unexpected failure");
      return {
        ok: false as const,
        errorCategory: "unknown" as const,
        message: VISION_ERROR_MESSAGES.unknown,
      };
    }
  });
