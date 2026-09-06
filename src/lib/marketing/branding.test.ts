import { describe, expect, it } from "vitest";

import { buildBrandOverlay, validateBranding } from "./branding";
import { brandProfile } from "./brand";

const overlay = () =>
  buildBrandOverlay({
    platform: "instagram",
    aspect: "9:16",
    seconds: 15,
    tagline: "Make space earn.",
    cta: "Find storage when you need it.",
  });

const copy = {
  title: "Make space earn.",
  description: "EarnRoom connects people who need storage with people who have space to spare.",
  caption: "Spare room sitting empty? Make space earn.",
  cta: "Find storage when you need it.",
};

describe("brand insertion and validation", () => {
  it("places the approved lock-up, tagline, website and CTA on the end card", () => {
    const spec = overlay();
    const roles = spec.layers.map((layer) =>
      layer.kind === "text" ? layer.role : `logo:${layer.position}`,
    );
    expect(roles).toContain("tagline");
    expect(roles).toContain("website");
    expect(roles).toContain("cta");
    expect(roles).toContain("logo:centre");
  });

  it("uses only the approved lock-up file, never a redrawn mark", () => {
    const spec = overlay();
    const logo = spec.layers.find((layer) => layer.kind === "logo" && layer.position === "centre");
    expect(logo && logo.kind === "logo" ? logo.asset : null).toBe(brandProfile().logoAsset);
  });

  it("passes a correctly branded, correctly formatted render", () => {
    const report = validateBranding({
      overlay: overlay(),
      expectedAspect: "9:16",
      rendered: { aspect: "9:16", seconds: 15 },
      copy,
    });
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("fails an unapproved tagline", () => {
    const spec = buildBrandOverlay({
      platform: "instagram",
      aspect: "9:16",
      seconds: 15,
      tagline: "Storage, sorted, guaranteed",
      cta: copy.cta,
    });
    const report = validateBranding({
      overlay: spec,
      expectedAspect: "9:16",
      rendered: { aspect: "9:16", seconds: 15 },
      copy,
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "tagline_approved")!.passed).toBe(false);
  });

  it("fails a misspelt brand name in the copy", () => {
    const report = validateBranding({
      overlay: overlay(),
      expectedAspect: "9:16",
      rendered: { aspect: "9:16", seconds: 15 },
      copy: { ...copy, description: "Earn Room connects people with spare space." },
    });
    expect(report.checks.find((check) => check.id === "brand_spelling")!.passed).toBe(false);
  });

  it("fails when the rendered file is not the shape or length that was asked for", () => {
    const report = validateBranding({
      overlay: overlay(),
      expectedAspect: "9:16",
      rendered: { aspect: "16:9", seconds: 40 },
      copy,
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "aspect_ratio")!.passed).toBe(false);
  });

  it("cannot confirm branding when nothing has been rendered", () => {
    const report = validateBranding({
      overlay: overlay(),
      expectedAspect: "9:16",
      rendered: null,
      copy,
    });
    expect(report.passed).toBe(false);
  });
});
