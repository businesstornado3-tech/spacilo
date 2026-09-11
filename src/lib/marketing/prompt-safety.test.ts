import { describe, expect, it } from "vitest";

import {
  PROHIBITION_LINE,
  findBrandTerms,
  isBrandFreePrompt,
  sanitizeProviderText,
} from "./prompt-safety";

describe("provider prompt brand safety", () => {
  it("removes the brand name, tagline and web address from campaign copy", () => {
    const clean = sanitizeProviderText(
      "EarnRoom helps neighbours. Make space earn. Visit earnroom.co.uk today.",
    );
    expect(clean.toLowerCase()).not.toContain("earnroom");
    expect(clean.toLowerCase()).not.toContain("make space earn");
    expect(findBrandTerms(clean)).toEqual([]);
  });

  it("removes instructions that would have the model draw branding", () => {
    const clean = sanitizeProviderText(
      "The EarnRoom logo and wordmark sit on a branded end card with a watermark.",
    );
    expect(findBrandTerms(clean)).toEqual([]);
  });

  it("allows branding words only inside the single prohibition line", () => {
    expect(isBrandFreePrompt(`A quiet hallway.\n${PROHIBITION_LINE}`)).toBe(true);
    expect(isBrandFreePrompt("Show the logo at the end.")).toBe(false);
  });

  it("reports exactly what leaked", () => {
    expect(findBrandTerms("The EarnRoom van pulls up.")).toContain("earnroom");
  });
});
