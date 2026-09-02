import { afterEach, describe, expect, it } from "vitest";

import { webhookSecrets } from "@/lib/payments/stripe.server";

const ORIGINAL = {
  platform: process.env["STRIPE_WEBHOOK_SECRET"],
  connect: process.env["STRIPE_CONNECT_WEBHOOK_SECRET"],
};

afterEach(() => {
  if (ORIGINAL.platform === undefined) delete process.env["STRIPE_WEBHOOK_SECRET"];
  else process.env["STRIPE_WEBHOOK_SECRET"] = ORIGINAL.platform;
  if (ORIGINAL.connect === undefined) delete process.env["STRIPE_CONNECT_WEBHOOK_SECRET"];
  else process.env["STRIPE_CONNECT_WEBHOOK_SECRET"] = ORIGINAL.connect;
});

describe("webhook signing secrets", () => {
  it("returns the platform secret when only it is configured", () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_platform";
    delete process.env["STRIPE_CONNECT_WEBHOOK_SECRET"];
    expect(webhookSecrets()).toEqual(["whsec_platform"]);
  });

  it("accepts both destinations' secrets", () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_platform";
    process.env["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_connect";
    expect(webhookSecrets()).toEqual(["whsec_platform", "whsec_connect"]);
  });

  it("de-duplicates when the same secret is configured twice", () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_same";
    process.env["STRIPE_CONNECT_WEBHOOK_SECRET"] = " whsec_same ";
    expect(webhookSecrets()).toEqual(["whsec_same"]);
  });

  it("ignores blank values", () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_platform";
    process.env["STRIPE_CONNECT_WEBHOOK_SECRET"] = "   ";
    expect(webhookSecrets()).toEqual(["whsec_platform"]);
  });

  it("throws when nothing is configured — unsigned/unknown requests are never accepted", () => {
    delete process.env["STRIPE_WEBHOOK_SECRET"];
    delete process.env["STRIPE_CONNECT_WEBHOOK_SECRET"];
    expect(() => webhookSecrets()).toThrow(/not configured/i);
  });
});
