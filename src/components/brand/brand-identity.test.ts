/**
 * Prompt 23B closeout — approved visual identity + customer-facing brand purity.
 *
 * 1. The symbol and lockups use crops of the supplied approved artwork.
 * 2. The favicon is derived from that same mark.
 * 3. No customer-facing string carries a legacy brand name any more —
 *    the internal SpaceFit architecture (modules, types, identifiers, code
 *    comments) is deliberately untouched.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { brand } from "@/config/brand";

const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

const SOURCE_FILES = walk("src").filter((f) => !/\.test\.tsx?$/.test(f));

/** Standalone brand word, ignoring identifiers such as `SpaceFitBadge`. */
const LEAK = /(?<![A-Za-z0-9_])SpaceFit(?![A-Za-z0-9_])/;

/** Lines that are comments, imports or module paths are internal, not copy. */
const isInternalLine = (line: string) => {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.includes("import ") ||
    trimmed.includes("@/")
  );
};

describe("EarnRoom symbol", () => {
  const mark = read("src/components/brand/EarnRoomMark.tsx");

  it("uses the approved lockup and icon assets", () => {
    expect(mark).toContain("earnroom-icon.png.asset.json");
    expect(mark).toContain("earnroom-lockup.png.asset.json");
    expect(mark).toContain("EarnRoomSymbolCompact");
  });

  it("does not recolour or redraw the approved artwork", () => {
    expect(mark).not.toContain("<svg");
    expect(mark).not.toContain("stroke=");
    expect(mark).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("hides decorative geometry from screen readers", () => {
    expect(mark).toContain('aria-hidden="true"');
  });

  it("is used by the header lock-up with the config-driven wordmark", () => {
    const logo = read("src/components/layout/Logo.tsx");
    expect(logo).toContain("earnroom-wordmark-transparent.png.asset.json");
    expect(logo).toContain("earnroom-lockup.png.asset.json");
    expect(brand.name).toBe("EarnRoom");
  });
});

describe("favicon", () => {
  it("ships raster icon variants derived from the approved artwork", () => {
    expect(() => statSync("public/favicon.png")).not.toThrow();
    expect(() => statSync("public/apple-touch-icon.png")).not.toThrow();
    expect(() => statSync("public/pwa-icon-192.png")).not.toThrow();
    expect(() => statSync("public/pwa-icon-512.png")).not.toThrow();
  });

  it("is referenced from the root route", () => {
    expect(read("src/routes/__root.tsx")).toContain("/favicon.png");
  });
});

describe("customer-facing brand purity", () => {
  it("never shows SpaceFit in product copy", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      if (file.endsWith(join("src", "config", "brand.ts"))) continue;
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (!isInternalLine(line) && LEAK.test(line)) offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the internal SpaceFit architecture intact", () => {
    expect(() => statSync("src/lib/spacefit/engine.ts")).not.toThrow();
    expect(() => statSync("src/hooks/useSpaceFitMatches.ts")).not.toThrow();
  });

  it("names EarnRoom AI as the intelligence layer", () => {
    expect(brand.ai).toBe("EarnRoom AI");
  });
});

describe("approved palette", () => {
  const css = read("src/styles.css");

  it("uses emerald as the action colour and navy as the ink", () => {
    // Emerald hue held at 162; lightness darkened from 0.58 to 0.53 so white
    // text on the primary button clears WCAG AA (4.03:1 -> 4.9:1).
    expect(css).toContain("--primary: oklch(0.53 0.125 162)");
    expect(css).toContain("--ink: oklch(0.21 0.033 265)");
  });

  it("keeps the EarnRoom AI signal emerald with a mint surface", () => {
    expect(css).toContain("--signal: oklch(0.72 0.15 163)");
    expect(css).toContain("--signal-soft: oklch(0.952 0.055 156)");
  });
});
