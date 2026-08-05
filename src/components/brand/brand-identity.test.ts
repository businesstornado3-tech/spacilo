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

/** The approved open hexagonal frame arms, shared by the component and the favicon. */
const ARM_UPPER = "M58 26V18L32 4 6 18v14h14";
const ARM_LOWER = "M6 38v8l26 14 26-14V32H44";
/** The stylised $ spine, shared by the master mark and the small-size variant. */
const DOLLAR_SPINE = "M38 26c0-2.6-2.7-4.4-6-4.4s-6 1.8-6 4.4";

describe("Spacilo symbol", () => {
  const mark = read("src/components/brand/SpaciloMark.tsx");

  it("reproduces the approved open hexagonal frame", () => {
    expect(mark).toContain(ARM_UPPER);
    expect(mark).toContain(ARM_LOWER);
  });

  it("carries both halves of the concept: space and value", () => {
    expect(mark).toMatch(/SPACE/);
    expect(mark).toMatch(/VALUE/);
    // the value symbol is the stylised $: an S spine pierced by a stem
    expect(mark).toContain(DOLLAR_SPINE);
    expect(mark).toContain('DOLLAR_STEM = "M32 19.4V47.2"');
  });

  it("ships an icon-only variant derived from the same geometry", () => {
    expect(mark).toContain("SpaciloSymbolCompact");
    expect(mark.split("MarkPaths").length).toBeGreaterThan(3);
  });

  it("inherits semantic tokens rather than hard-coded colour", () => {
    expect(mark).toContain("currentColor");
    expect(mark).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("hides decorative geometry from screen readers", () => {
    expect(mark.split('aria-hidden="true"').length).toBeGreaterThan(2);
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
    expect(favicon).toContain(ARM_UPPER);
    expect(favicon).toContain(ARM_LOWER);
    expect(favicon).toContain(DOLLAR_SPINE);
    expect(favicon).toContain('d="M32 19.4V47.2"');
  });

  it("does not revert to a retired mark", () => {
    expect(favicon).not.toContain("M52 13H25L12 23v8l10 7h20l10 7v6L42 59H12");
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
