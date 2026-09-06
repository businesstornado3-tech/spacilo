/**
 * Provider-neutral video generation.
 *
 * Marketing Intelligence submits a standard job and never knows where the
 * pixels come from. Two provider kinds exist:
 *
 *   SELF_HOSTED — the default. An open-weight model on EarnRoom's own worker.
 *                 Zero per-video API fee.
 *   PAID_HOSTED — optional, off by default, and only ever used when the founder
 *                 has explicitly selected it AND explicitly confirmed the
 *                 charge for this generation. There is no silent fallback.
 *
 * Pure module: decisions only. The HTTP clients live in the `.server` files.
 */
export type VideoProviderKind = "SELF_HOSTED" | "PAID_HOSTED";

export type VideoProviderMode = {
  /** Which provider the founder has selected. Defaults to self-hosted. */
  provider: VideoProviderKind;
  /** Paid generation additionally requires this to be turned on. */
  paidProviderEnabled: boolean;
};

export const DEFAULT_VIDEO_PROVIDER_MODE: VideoProviderMode = {
  provider: "SELF_HOSTED",
  paidProviderEnabled: false,
};

export function readProviderMode(settings: unknown): VideoProviderMode {
  const record = (settings ?? {}) as Record<string, unknown>;
  const provider = record["videoProvider"];
  return {
    provider: provider === "PAID_HOSTED" ? "PAID_HOSTED" : "SELF_HOSTED",
    paidProviderEnabled: record["paidVideoProviderEnabled"] === true,
  };
}

export type ProviderAvailability = {
  /** Self-hosted worker health as last reported. */
  selfHosted: { configured: boolean; status: string; detail: string };
  paid: { configured: boolean; detail: string };
};

export type ProviderRoute =
  | {
      ok: true;
      kind: VideoProviderKind;
      /** True only for a paid route the founder confirmed for this generation. */
      chargeable: boolean;
      detail: string;
    }
  | {
      ok: false;
      status:
        | "SELF_HOSTED_UNAVAILABLE"
        | "PAID_NOT_SELECTED"
        | "PROVIDER_NOT_CONFIGURED"
        | "CONFIRMATION_REQUIRED";
      detail: string;
      offerPaid: boolean;
    };

/**
 * Chooses the route for one generation request.
 *
 * The rules that matter:
 * - In self-hosted mode a paid call can never happen, whatever fails.
 * - A paid call needs the paid provider selected, enabled, configured AND
 *   confirmed for this specific generation.
 */
export function routeGeneration(input: {
  mode: VideoProviderMode;
  availability: ProviderAvailability;
  /** Founder ticked "I accept this generation may be charged" for this request. */
  confirmedPaid: boolean;
}): ProviderRoute {
  const { mode, availability } = input;

  if (mode.provider === "SELF_HOSTED") {
    if (!availability.selfHosted.configured) {
      return {
        ok: false,
        status: "PROVIDER_NOT_CONFIGURED",
        detail:
          "Self-hosted video generation is not configured yet. Point EarnRoom at a video worker before generating.",
        offerPaid: availability.paid.configured,
      };
    }
    if (
      availability.selfHosted.status === "OFFLINE" ||
      availability.selfHosted.status === "ERROR"
    ) {
      return {
        ok: false,
        status: "SELF_HOSTED_UNAVAILABLE",
        detail: "Self-hosted video generation is currently unavailable.",
        offerPaid: availability.paid.configured,
      };
    }
    return {
      ok: true,
      kind: "SELF_HOSTED",
      chargeable: false,
      detail: "Generating on the self-hosted worker. No video API fee.",
    };
  }

  if (!mode.paidProviderEnabled) {
    return {
      ok: false,
      status: "PAID_NOT_SELECTED",
      detail: "The paid video provider has not been switched on.",
      offerPaid: availability.paid.configured,
    };
  }
  if (!availability.paid.configured) {
    return {
      ok: false,
      status: "PROVIDER_NOT_CONFIGURED",
      detail: availability.paid.detail,
      offerPaid: false,
    };
  }
  if (!input.confirmedPaid) {
    return {
      ok: false,
      status: "CONFIRMATION_REQUIRED",
      detail: "This generation may incur provider charges. Confirm before it runs.",
      offerPaid: true,
    };
  }
  return {
    ok: true,
    kind: "PAID_HOSTED",
    chargeable: true,
    detail: "Generating with the paid hosted provider, as explicitly chosen.",
  };
}
