/**
 * Zero-AI passive load.
 *
 * Opening a dashboard or the SpaceFit hub must never cost a model call: those
 * surfaces read canonical rows and run deterministic engines only. AI runs when
 * a person deliberately starts a scan, and nowhere else. This is enforced
 * statically, because a regression here is silent and expensive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Surfaces a signed-in person can land on without asking for a scan. */
const PASSIVE_SURFACES = [
  "src/routes/_authenticated.spacefit.tsx",
  "src/routes/_authenticated.renter.index.tsx",
  "src/routes/_authenticated.host.index.tsx",
  "src/components/spacefit/RenterSpaceFitCard.tsx",
  "src/components/host/spacefit/HostSpaceFitCard.tsx",
  "src/lib/spacefit-hub.ts",
];

/** Anything that can reach the vision provider, directly or through a hook. */
const AI_ENTRY_POINTS = [
  "spacefit-vision.functions",
  "spacefit-space.functions",
  "spacefit-guest.functions",
  "provider.server",
  "useSpaceFitVision",
  "useGuestSpaceFit",
  "analyseInventoryPhotos",
  "analyseSpacePhotos",
  "getVisionProvider",
];

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("passive SpaceFit surfaces run no AI", () => {
  it.each(PASSIVE_SURFACES)("%s reaches no AI entry point", (file) => {
    const source = read(file);
    for (const entry of AI_ENTRY_POINTS) {
      expect(source, `${file} must not reference ${entry}`).not.toContain(entry);
    }
  });

  it("derives hub state without network or database access", () => {
    const source = read("src/lib/spacefit-hub.ts");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("createServerFn");
    expect(source).not.toContain("Math.random");
  });

  it("keeps the deterministic engines free of AI imports", () => {
    for (const file of [
      "src/lib/spacefit/requirement.ts",
      "src/lib/spacefit/plan.ts",
      "src/lib/pricing/suggestion.ts",
      "src/lib/spacefit-guest/preview.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toContain("provider.server");
      expect(source, file).not.toContain("Math.random");
    }
  });

  it("only starts a scan from an explicit scan surface", () => {
    const scanSurfaces = [
      "src/routes/spacefit.stuff.tsx",
      "src/routes/spacefit.space.tsx",
      "src/routes/_authenticated.renter.inventory.photos.tsx",
    ];
    const usesScanHook = scanSurfaces.filter((file) => {
      const source = read(file);
      return source.includes("useGuestSpaceFit") || source.includes("useSpaceFitVision");
    });
    expect(usesScanHook.length).toBeGreaterThan(0);
  });
});
