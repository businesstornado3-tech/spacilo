/**
 * Guest SpaceFit — client-callable server functions.
 *
 * Thin wrappers only. The three guest entry points are intentionally
 * UNAUTHENTICATED (that is the whole point of the preview), so each one is
 * bounded by the limits in `spacefit-guest/config.ts`: session references,
 * per-session and per-network rate limits, photo counts, byte ceilings, a MIME
 * allowlist and duplicate-request suppression. Claiming is authenticated.
 *
 * No provider or service-role credential is ever returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GUEST_ALLOWED_MIME_TYPES,
  MAX_GUEST_PHOTOS,
} from "@/lib/spacefit-guest/config";

const kindSchema = z.enum(["renter", "host"]);

const startInput = z.object({ kind: kindSchema });

const analyseInput = z.object({
  token: z.string().min(40).max(64),
  kind: kindSchema,
  images: z
    .array(
      z.object({
        mimeType: z.enum(GUEST_ALLOWED_MIME_TYPES),
        base64: z.string().min(16).max(12_000_000),
      }),
    )
    .min(1)
    .max(MAX_GUEST_PHOTOS),
  spaceType: z.string().max(40).nullable().optional(),
  clientRequestId: z.string().max(64).optional(),
});

const claimInput = z.object({ token: z.string().min(40).max(64) });

/** Best-effort client address for network-aware throttling. */
function clientIp(): string | null {
  try {
    const request = getRequest();
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
    return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  } catch {
    return null;
  }
}

export const startGuestSpaceFit = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(async ({ data }) => {
    const { createGuestSession, GuestSpaceFitError } = await import(
      "@/lib/spacefit-guest/guest.server"
    );
    try {
      const session = await createGuestSession(data.kind, clientIp());
      return { ok: true as const, token: session.token, expiresAt: session.expiresAt };
    } catch (error) {
      if (error instanceof GuestSpaceFitError) {
        return { ok: false as const, errorCategory: error.category, message: error.message };
      }
      console.error("[spacefit-guest] session failure");
      return {
        ok: false as const,
        errorCategory: "unknown" as const,
        message: "We couldn't start a preview. Please try again.",
      };
    }
  });

export const analyseGuestSpaceFit = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analyseInput.parse(data))
  .handler(async ({ data }) => {
    const { runGuestAnalysis, GuestSpaceFitError } = await import(
      "@/lib/spacefit-guest/guest.server"
    );
    try {
      const result = await runGuestAnalysis({
        token: data.token,
        kind: data.kind,
        images: data.images,
        spaceType: data.spaceType ?? null,
        clientRequestId: data.clientRequestId ?? null,
        clientIp: clientIp(),
      });
      return { ok: true as const, result };
    } catch (error) {
      if (error instanceof GuestSpaceFitError) {
        return { ok: false as const, errorCategory: error.category, message: error.message };
      }
      console.error("[spacefit-guest] analysis failure");
      return {
        ok: false as const,
        errorCategory: "unknown" as const,
        message: "Something went wrong while analysing your photos.",
      };
    }
  });

export const claimGuestSpaceFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => claimInput.parse(data))
  .handler(async ({ data, context }) => {
    const { claimGuestSession, GuestSpaceFitError } = await import(
      "@/lib/spacefit-guest/guest.server"
    );
    try {
      const result = await claimGuestSession({
        supabase: context.supabase,
        userId: context.userId,
        token: data.token,
      });
      return { ok: true as const, result };
    } catch (error) {
      if (error instanceof GuestSpaceFitError) {
        return { ok: false as const, errorCategory: error.category, message: error.message };
      }
      console.error("[spacefit-guest] claim failure");
      return {
        ok: false as const,
        errorCategory: "unknown" as const,
        message: "We couldn't restore that scan.",
      };
    }
  });
