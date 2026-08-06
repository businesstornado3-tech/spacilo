import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { howItWorksFaq, hostJourney, renterJourney } from "@/data/how-it-works";
import { trustSections, trustCore } from "@/data/trust";

const forbiddenClaims = [
  "100% safe",
  "guaranteed safe",
  "fully insured",
  "zero risk",
  "verified safe",
  "trusted by thousands",
  "every host verified",
  "every renter verified",
  "guaranteed secure",
  "ai verified",
  "guaranteed fit",
  "guaranteed earnings",
];

const leakStrings = ["Space" + "Fit", "Project" + " Stow"];

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("public marketing routes", () => {
  const howItWorks = readText("src/routes/how-it-works.tsx");
  const trust = readText("src/routes/trust.tsx");
  const footer = readText("src/components/layout/SiteFooter.tsx");
  const dataFiles = [
    readText("src/data/how-it-works.ts"),
    readText("src/data/trust.ts"),
  ];

  it("does not render PagePlaceholder on how-it-works or trust", () => {
    expect(howItWorks).not.toMatch(/PagePlaceholder/);
    expect(trust).not.toMatch(/PagePlaceholder/);
  });

  it("contains no forbidden trust claim strings", () => {
    const haystack = [howItWorks, trust, ...dataFiles].join("\n").toLowerCase();
    for (const claim of forbiddenClaims) {
      expect(haystack).not.toContain(claim.toLowerCase());
    }
  });

  it("does not leak internal codenames in customer-facing content modules", () => {
    const haystack = dataFiles.join("\n");
    for (const leak of leakStrings) {
      expect(haystack).not.toContain(leak);
    }
  });

  it("declares 8 renter journey steps and 8 host journey steps", () => {
    expect(renterJourney).toHaveLength(8);
    expect(hostJourney).toHaveLength(8);
  });

  it("has FAQ content and trust sections", () => {
    expect(howItWorksFaq.length).toBeGreaterThan(0);
    expect(trustSections.length).toBeGreaterThan(0);
    expect(trustCore.body.length).toBeGreaterThan(0);
  });

  it("every footer link points to an existing route file", () => {
    const linkMatches = [...footer.matchAll(/to:\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((v): v is string => Boolean(v));
    expect(linkMatches.length).toBeGreaterThan(0);

    const routesDir = path.resolve(process.cwd(), "src/routes");
    const routeFiles = fs.readdirSync(routesDir);

    const routeExistsFor = (link: string) => {
      if (link === "/") return routeFiles.includes("index.tsx");
      // /a/b -> a.b.tsx, a/b.tsx, or the index-route form a.index.tsx
      const base = link.slice(1).split("/").join(".");
      const dotted = base + ".tsx";
      const indexed = base + ".index.tsx";
      const nested = link.slice(1) + ".tsx";
      return (
        routeFiles.includes(dotted) || routeFiles.includes(indexed) || routeFiles.includes(nested)
      );
    };

    for (const link of linkMatches) {
      expect(routeExistsFor(link)).toBe(true);
    }
  });
});
