/**
 * Prompt 23B closeout — approved visual identity + customer-facing brand purity.
 *
 * 1. The symbol is the approved hexagonal SPACE + VALUE mark.
 * 2. The favicon is derived from that same mark.
 * 3. No customer-facing string says "SpaceFit" or "Project Stow" any more —
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

describe("Spacilo symbol", () => {
  const mark = read("src/components/brand/SpaciloMark.tsx");

  it("uses the approved hexagonal geometry", () => {
    expect(mark).toContain("M16 2.2 27.9 9v14L16 29.8 4.1 23V9Z");
  });

  it("carries both halves of the concept: space and value", () => {
    expect(mark).toMatch(/SPACE/);
    expect(mark).toMatch(/VALUE/);
    // three rising value bars
    expect((mark.match(/<rect /g) ?? []).length).toBe(3);
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

  it("is the same hexagonal mark", () => {
    expect(favicon).toContain("M16 2.2 27.9 9v14L16 29.8 4.1 23V9Z");
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
