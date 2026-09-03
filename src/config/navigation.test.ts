import { describe, expect, it } from "vitest";

import { marketingNav, navForMode } from "./navigation";

describe("public header navigation", () => {
  it("contains the required discovery and marketing links in order", () => {
    expect(marketingNav.map((item) => item.label)).toEqual([
      "Find Storage",
      "Discover",
      "Tools",
      "Guides",
      "List Your Space",
      "How It Works",
      "Trust & Safety",
    ]);
  });

  it("keeps every label short enough to avoid wrapping on desktop", () => {
    for (const item of marketingNav) {
      expect(item.label.length, `${item.label} is too long`).toBeLessThanOrEqual(20);
    }
  });

  it("keeps Discover, Tools and Guides in the public nav", () => {
    const paths = marketingNav.map((item) => item.to);
    expect(paths).toEqual(expect.arrayContaining(["/discover", "/tools", "/guides"]));
  });
});

describe("mode navigation", () => {
  it("returns renter nav by default", () => {
    const nav = navForMode("renter");
    expect(nav[0]?.to).toBe("/renter");
    expect(nav.some((item) => item.to === "/profile")).toBe(true);
  });

  it("returns host nav for host mode", () => {
    const nav = navForMode("host");
    expect(nav[0]?.to).toBe("/host");
  });
});
