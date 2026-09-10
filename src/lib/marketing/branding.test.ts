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

describe("brand name spelling in campaign copy", () => {
  const overlay = buildBrandOverlay({
    platform: "instagram",
    aspect: "9:16",
    seconds: 20,
    tagline: brandProfile().endCard.tagline,
    cta: "Find storage near you.",
  });
  const rendered = { aspect: "9:16" as const, seconds: 20 };
  const check = (copy: { title?: string; description?: string; caption?: string }) =>
    validateBranding({
      overlay,
      expectedAspect: "9:16",
      rendered,
      copy: {
        title: copy.title ?? "Storage near you",
        description: copy.description ?? "EarnRoom connects people with spare space.",
        caption: copy.caption ?? "EarnRoom",
        cta: "Find storage near you.",
      },
    }).checks.find((entry) => entry.id === "brand_spelling")!;

  it("accepts the web address, which is lower case by nature", () => {
    expect(check({ description: "See spare space on earnroom.co.uk today." }).passed).toBe(true);
    expect(check({ description: "Visit https://earnroom.co.uk/find-storage" }).passed).toBe(true);
  });

  it("accepts the name written exactly as approved", () => {
    expect(check({ title: "EarnRoom in Portsmouth" }).passed).toBe(true);
  });

  it("still rejects every real misspelling", () => {
    for (const wrong of ["Earn Room", "Earnroom", "EarnRom", "EarnRoam", "earn-room"]) {
      expect(check({ title: `${wrong} storage` }).passed).toBe(false);
    }
  });
});

describe("brand identity survives every generation mode", () => {
  it("carries the official wordmark and the primary tagline throughout, not just the end card", () => {
    const spec = overlay();
    const watermark = spec.layers.find(
      (layer) => layer.kind === "logo" && layer.position === "bottom-right",
    );
    const persistent = spec.layers.find(
      (layer) => layer.kind === "text" && layer.role === "tagline" && layer.fromSeconds === 0,
    );
    expect(watermark && watermark.kind === "logo" ? watermark.asset : null).toBe(
      brandProfile().watermark.asset,
    );
    expect(persistent && persistent.kind === "text" ? persistent.value : null).toBe(
      "Make space earn.",
    );
  });

  it("fails validation when the persistent logo and tagline are stripped out", () => {
    const spec = overlay();
    const stripped = {
      ...spec,
      layers: spec.layers.filter(
        (layer) =>
          !(layer.kind === "logo" && layer.position === "bottom-right") &&
          !(layer.kind === "text" && layer.role === "tagline" && layer.fromSeconds === 0),
      ),
    };
    const report = validateBranding({
      overlay: stripped,
      expectedAspect: "9:16",
      rendered: { aspect: "9:16", seconds: 15 },
      copy,
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "logo_persistent")!.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "tagline_persistent")!.passed).toBe(false);
  });

  it("applies the same branding to every aspect and platform, without redrawing the logo", () => {
    for (const [platform, aspect] of [
      ["tiktok", "9:16"],
      ["youtube", "16:9"],
      ["instagram", "1:1"],
    ] as const) {
      const spec = buildBrandOverlay({
        platform,
        aspect,
        seconds: 20,
        tagline: "Make space earn.",
        cta: copy.cta,
      });
      const report = validateBranding({
        overlay: spec,
        expectedAspect: aspect,
        rendered: { aspect, seconds: 20 },
        copy,
      });
      expect(report.passed).toBe(true);
    }
  });
});
