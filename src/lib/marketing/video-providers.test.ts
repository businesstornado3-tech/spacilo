import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_PROVIDER_MODE,
  readProviderMode,
  routeGeneration,
  type ProviderAvailability,
} from "./video-providers";

const availability = (overrides: Partial<ProviderAvailability> = {}): ProviderAvailability => ({
  selfHosted: { configured: true, status: "AVAILABLE", detail: "ok" },
  paid: { configured: true, detail: "configured" },
  ...overrides,
});

describe("video provider mode", () => {
  it("defaults to the self-hosted worker", () => {
    expect(DEFAULT_VIDEO_PROVIDER_MODE.provider).toBe("SELF_HOSTED");
    expect(readProviderMode({}).provider).toBe("SELF_HOSTED");
    expect(readProviderMode(undefined).paidProviderEnabled).toBe(false);
  });

  it("reads an explicit paid selection", () => {
    expect(
      readProviderMode({ videoProvider: "PAID_HOSTED", paidVideoProviderEnabled: true }),
    ).toEqual({ provider: "PAID_HOSTED", paidProviderEnabled: true });
  });
});

describe("routeGeneration", () => {
  const selfHosted = { provider: "SELF_HOSTED" as const, paidProviderEnabled: false };

  it("routes to the self-hosted worker with no charge", () => {
    const route = routeGeneration({
      mode: selfHosted,
      availability: availability(),
      confirmedPaid: false,
    });
    expect(route).toMatchObject({ ok: true, kind: "SELF_HOSTED", chargeable: false });
  });

  it("never silently falls back to the paid provider when the worker is down", () => {
    const route = routeGeneration({
      mode: selfHosted,
      availability: availability({
        selfHosted: { configured: true, status: "OFFLINE", detail: "down" },
      }),
      confirmedPaid: true,
    });
    expect(route.ok).toBe(false);
    if (!route.ok) {
      expect(route.status).toBe("SELF_HOSTED_UNAVAILABLE");
      expect(route.offerPaid).toBe(true);
    }
  });

  it("says so plainly when nothing is configured", () => {
    const route = routeGeneration({
      mode: selfHosted,
      availability: availability({
        selfHosted: { configured: false, status: "OFFLINE", detail: "" },
        paid: { configured: false, detail: "not configured" },
      }),
      confirmedPaid: false,
    });
    expect(route.ok).toBe(false);
    if (!route.ok) expect(route.status).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("refuses a paid generation that has not been enabled", () => {
    const route = routeGeneration({
      mode: { provider: "PAID_HOSTED", paidProviderEnabled: false },
      availability: availability(),
      confirmedPaid: true,
    });
    expect(route.ok).toBe(false);
    if (!route.ok) expect(route.status).toBe("PAID_NOT_SELECTED");
  });

  it("requires per-generation confirmation before charging", () => {
    const mode = { provider: "PAID_HOSTED" as const, paidProviderEnabled: true };
    const unconfirmed = routeGeneration({
      mode,
      availability: availability(),
      confirmedPaid: false,
    });
    expect(unconfirmed.ok).toBe(false);
    if (!unconfirmed.ok) expect(unconfirmed.status).toBe("CONFIRMATION_REQUIRED");

    const confirmed = routeGeneration({ mode, availability: availability(), confirmedPaid: true });
    expect(confirmed).toMatchObject({ ok: true, kind: "PAID_HOSTED", chargeable: true });
  });
});
