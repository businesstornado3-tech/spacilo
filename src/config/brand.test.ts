/**
 * Guards the final EarnRoom brand migration: every customer-facing brand
 * string comes from `src/config/brand.ts`, and no legacy brand name survives.
 */
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { brand } from "@/config/brand";

const grep = (pattern: string) => {
  try {
    return execSync(`grep -rn --include=*.ts --include=*.tsx -- ${JSON.stringify(pattern)} src`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};

describe("EarnRoom brand", () => {
  it("uses the EarnRoom names", () => {
    expect(brand.name).toBe("EarnRoom");
    expect(brand.ai).toBe("EarnRoom AI");
    expect(brand.tagline).toBe("Make space earn.");
  });

  it("leaves no legacy brand name in product code", () => {
    const offenders = [
      ...grep("Spacilo"),
      ...grep("Spacilo AI"),
      ...grep("Project Stow"),
      ...grep("SpaceFit AI"),
    ].filter(
      (line) =>
        !line.startsWith("src/config/brand.ts") && !line.startsWith("src/config/brand.test.ts"),
    );
    expect(offenders).toEqual([]);
  });
});
