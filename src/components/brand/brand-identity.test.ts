/**
 * Prompt 23B closeout — approved visual identity + customer-facing brand purity.
 *
 * 1. The symbol is the approved geometric S + VALUE mark.
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

/** The approved spatial S, shared by the component and the favicon. */
const SPATIAL_S = "M53.5 17.2 32 5.2 10.5 17.2v12.3L45.8 48v.8L32 56.6 10.5 44.6";
/** The stylised $ spine, shared by the master mark and the small-size variant. */
const DOLLAR_SPINE = "M39.4 25.2c-1.9-2.1-4.4-3.1-7.4-3.1";

describe("Spacilo symbol", () => {
  const mark = read("src/components/brand/SpaciloMark.tsx");

  it("uses one open geometric S rather than a closed hexagon", () => {
    expect(mark).toContain(SPATIAL_S);
    expect(mark).not.toContain("HEX_ARM");
    expect(mark).not.toContain("M32 3.6 57 17.6v28.8");
  });

  it("carries both halves of the concept: space and value", () => {
    expect(mark).toMatch(/SPACE/);
    expect(mark).toMatch(/VALUE/);
    // the value symbol is the stylised $: an S spine pierced by a stem
    expect(mark).toContain(DOLLAR_SPINE);
    expect(mark).toContain('DOLLAR_STEM = "M32 17.4V47.6"');
  });

  it("ships a simplified small-size variant that keeps the $", () => {
    expect(mark).toContain("SpaciloSymbolCompact");
    expect(mark.split("DOLLAR_SPINE").length).toBeGreaterThan(4);
  });

  it("inherits semantic tokens rather than hard-coded colour", () => {
    expect(mark).toContain("currentColor");
    expect(mark).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("is used by the header lock-up with the config-driven wordmark", () => {
    const logo = read("src/components/layout/Logo.tsx");
    expect(logo).toContain("SpaciloSymbol");
    expect(logo).toContain("{brand.name}");
    expect(brand.name).toBe("Spacilo");
  });
});

describe("favicon", () => {
  const favicon = read("public/favicon.svg");

  it("is the simplified variant of the same mark, $ intact", () => {
    expect(favicon).toContain(SPATIAL_S);
    expect(favicon).toContain(DOLLAR_SPINE);
    expect(favicon).toContain('d="M32 17.4V47.6"');
  });

  it("is referenced from the root route", () => {
    expect(read("src/routes/__root.tsx")).toContain("/favicon.svg");
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

  it("names Spacilo AI as the intelligence layer", () => {
    expect(brand.ai).toBe("Spacilo AI");
  });
});

describe("approved palette", () => {
  const css = read("src/styles.css");

  it("uses emerald as the action colour and navy as the ink", () => {
    expect(css).toContain("--primary: oklch(0.58 0.125 162)");
    expect(css).toContain("--ink: oklch(0.21 0.033 265)");
  });

  it("keeps the Spacilo AI signal emerald with a mint surface", () => {
    expect(css).toContain("--signal: oklch(0.72 0.15 163)");
    expect(css).toContain("--signal-soft: oklch(0.952 0.055 156)");
  });
});
