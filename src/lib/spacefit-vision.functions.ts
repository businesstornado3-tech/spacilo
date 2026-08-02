/**
 * SpaceFit Vision — client-callable server functions.
 *
 * Thin wrappers only: all logic lives in server-only modules. Photo bytes and
 * provider credentials never leave the server, and every call is authenticated
 * so a renter can only analyse their own inventory.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_PHOTOS_PER_ANALYSIS } from "@/lib/spacefit-vision/schema";

const analyseInput = z.object({
  inventoryId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS_PER_ANALYSIS),
  clientRequestId: z.string().max(64).optional(),
});

export const analyseInventoryPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyseInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runInventoryAnalysis, AnalysisError } = await import(
      "@/lib/spacefit-vision/analyse.server"
    );
    const { VISION_ERROR_MESSAGES } = await import("@/lib/spacefit-vision/schema");

    try {
      const summary = await runInventoryAnalysis({
        supabase: context.supabase,
        userId: context.userId,
        inventoryId: data.inventoryId,
        photoIds: data.photoIds,
        clientRequestId: data.clientRequestId ?? null,
      });
      return { ok: true as const, ...summary };
    } catch (error) {
      if (error instanceof AnalysisError) {
        const category = error.category;
        const message =
          category === "forbidden"
            ? "That inventory isn't available."
            : category === "invalid_request"
              ? "Select at least one photo to analyse."
              : VISION_ERROR_MESSAGES[category];
        return { ok: false as const, errorCategory: category, message };
      }
      console.error("[spacefit-vision] unexpected failure");
      return {
        ok: false as const,
        errorCategory: "unknown" as const,
        message: VISION_ERROR_MESSAGES.unknown,
      };
    }
  });
