/**
 * Guards the homepage claims we are not allowed to make while payments,
 * verification and reviews do not exist yet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hostEntryTarget } from "@/lib/host-entry";

const FILES = [
  "src/routes/index.tsx",
  "src/components/home/Hero.tsx",
  "src/components/home/TwoSidedValue.tsx",
  "src/components/home/WhyStow.tsx",
  "src/components/home/HowItWorks.tsx",
  "src/components/home/HostCallout.tsx",
  "src/components/home/HostEntryButton.tsx",
  "src/components/home/LaunchArea.tsx",
];

const BANNED = [
  /insured/i,
  /guaranteed/i,
  /fully protected/i,
  /background check/i,
  /book instantly/i,
  /instant booking/i,
  /secure payments/i,
  /cheapest/i,
  /thousands of/i,
];

const copy = FILES.map((file) => readFileSync(file, "utf8")).join("\n");

describe("homepage copy", () => {
  it("makes no unsupported trust, insurance or payment claims", () => {
    for (const pattern of BANNED) {
      expect(copy).not.toMatch(pattern);
    }
  });

  it("explains both sides of the marketplace", () => {
    expect(copy).toContain("Need more space?");
    expect(copy).toContain("Have space you're not using?");
    expect(copy).toContain("Turn unused space into monthly income.");
  });

  it("stops the renter journey at a request, never a booking or payment", () => {
    expect(copy).toContain("Send a request");
    expect(copy).toContain(
      "Sending a request doesn't book the space or take payment. The host still needs to respond.",
    );
  });

  it("routes every host CTA through the shared host entry helper", () => {
    const hostCtas = [
      "src/components/home/Hero.tsx",
      "src/components/home/TwoSidedValue.tsx",
      "src/components/home/HostCallout.tsx",
    ].map((file) => readFileSync(file, "utf8"));
    for (const file of hostCtas) expect(file).toContain("HostEntryButton");
    expect(readFileSync("src/components/home/HostEntryButton.tsx", "utf8")).toContain(
      "hostEntryTarget",
    );
    expect(hostEntryTarget(false)).toEqual({ to: "/signup", search: { mode: "host" } });
    expect(hostEntryTarget(true)).toEqual({ to: "/host/spaces/new" });
  });
});
