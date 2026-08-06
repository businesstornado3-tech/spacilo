/**
 * The hero result panel is illustrative only: static copy, bounded language,
 * both renter and host examples, and no AI, camera or data-fetching imports.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preview = readFileSync("src/components/home/HeroAiPreview.tsx", "utf8");

describe("hero illustrative Spacilo AI preview", () => {
  it("shows the renter example figures", () => {
    expect(preview).toContain("14 items");
    expect(preview).toContain("~3.1 m³");
    expect(preview).toContain("94%");
  });

  it("shows the host example figures", () => {
    expect(preview).toContain("~8.4 m³");
    expect(preview).toContain("Boxes · luggage · small furniture");
    expect(preview).toContain("£45–£65*");
  });

  it("labels both states as illustrative examples", () => {
    expect(preview).toContain("Illustrative example — not your result.");
    expect(preview).toMatch(/Illustrative example — actual results depend/);
  });

  it("uses bounded language only", () => {
    expect(preview).toMatch(/Estimated|Potential/);
    expect(preview).not.toMatch(/guaranteed|exact fit|confirmed/i);
  });

  it("defaults to the renter example and lets visitors switch", () => {
    expect(preview).toContain('useState<ExampleId>("renter")');
    expect(preview).toContain("Host example");
  });

  it("implies no live processing", () => {
    expect(preview).not.toMatch(/scanning|analysing|analyzing|processing|loading/i);
    expect(preview).not.toMatch(/setTimeout|setInterval|getUserMedia/);
  });

  it("imports no AI, camera, scanner, admin or data modules", () => {
    expect(preview).not.toMatch(/livescan|LiveScanner|BoundaryEditor|SpaceScanner/i);
    expect(preview).not.toMatch(/@\/components\/admin|@\/lib\/admin/);
    expect(preview).not.toMatch(/supabase|useQuery|createServerFn|fetch\(/);
  });

  it("is wired into the hero card in place of the old static copy", () => {
    const hero = readFileSync("src/components/home/Hero.tsx", "utf8");
    expect(hero).toContain("<HeroAiPreview />");
    expect(hero).not.toContain("A neighbourhood storage marketplace.");
  });
});
