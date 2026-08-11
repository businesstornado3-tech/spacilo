/**
 * Phase 6N — renderer provider rollback guarantees.
 *
 * These tests pin the architectural rules rather than the wording of a prompt:
 * the renderer runs through the Lovable AI Gateway with no separately funded
 * vendor account, the manifest is an exhaustive whitelist, and an unverifiable
 * render is never called verified.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildRenderPrompt,
  coverageOf,
  verdictFor,
} from "@/routes/api/spaceplanner-visualise";

const source = readFileSync("src/routes/api/spaceplanner-visualise.ts", "utf8");

const inventory = [
  { id: "u_01", label: "Television", quantity: 1 },
  { id: "u_02", label: "Suitcase", quantity: 2 },
  { id: "u_03", label: "Cardboard box", quantity: 3 },
];

const prompt = () =>
  buildRenderPrompt({
    instruction: "Place each unit at its manifest coordinates.",
    manifest: inventory,
    required: inventory.map((entry) => ({ id: entry.id, label: entry.label })),
    roomFeatures: [{ id: "f_01", label: "Radiator" }],
    emphasise: [],
    hasItemPhotos: true,
  });

describe("provider rollback", () => {
  it("renders through the Lovable AI Gateway", () => {
    expect(source).toContain("https://ai.gateway.lovable.dev/v1");
    expect(source).toContain("/images/generations");
    expect(source).toContain('const PROVIDER = "lovable-ai-gateway"');
    expect(source).toContain('"google/gemini-3-pro-image"');
  });

  it("no longer calls the OpenAI API directly from the render path", () => {
    expect(source).not.toContain("api.openai.com");
    expect(source).not.toContain("OPENAI_API_KEY");
  });

  it("reads the gateway key server-side only and never falls back", () => {
    expect(source).toContain('process.env["LOVABLE_API_KEY"]');
    expect(source).not.toMatch(/import\.meta\.env[^\n]*LOVABLE_API_KEY/);
    expect(source).toContain('error: "not_configured"');
  });

  it("edits the user's own photograph rather than generating a new room", () => {
    expect(source).toContain('{ type: "image_url", image_url: { url: space } }');
    expect(source).toContain('modalities: ["image", "text"]');
  });

  it("reports provider, model and plan hash for diagnostics", () => {
    expect(source).toContain("provider: PROVIDER");
    expect(source).toContain("diagnosticId");
    expect(source).toContain("planHash");
    expect(source).toContain("renderMs");
  });
});


describe("zero invention", () => {
  it("gives the model an exhaustive per-object required list", () => {
    const text = prompt();
    expect(text).toContain("u_01 = 1 × Television");
    expect(text).toContain("u_02 = 2 × Suitcase");
    expect(text).toContain("u_03 = 3 × Cardboard box");
    expect(text).toContain("REQUIRED_OBJECTS");
  });

  it("forbids substitution and invention explicitly", () => {
    const text = prompt();
    expect(text).toMatch(/Do not add, remove, replace, duplicate, merge, substitute or infer/);
    expect(text).toContain("No shoes");
  });

  it("keeps the deterministic manifest authoritative over the model", () => {
    expect(prompt()).toContain("THE MANIFEST IS AUTHORITATIVE");
    expect(prompt()).toContain("RENDERER, not a planner");
  });

  it("preserves fixed room features", () => {
    expect(prompt()).toContain("f_01=Radiator");
  });
});

describe("render verification", () => {
  const required = inventory.map((entry) => entry.id);

  it("marks shoes as an invented object when they are not in inventory", () => {
    const coverage = coverageOf(required, required, ["shoes"], inventory.map((e) => e.label));
    expect(coverage.faithful).toBe(false);
    expect(coverage.unexpected).toContain("shoes");
    expect(verdictFor(coverage)).toBe("unfaithful");
  });

  it("accepts shoes when they are a confirmed unit", () => {
    const withShoes = [...required, "u_04"];
    const coverage = coverageOf(withShoes, withShoes, ["shoes"], [
      ...inventory.map((e) => e.label),
      "Shoes",
    ]);
    expect(coverage.faithful).toBe(true);
    expect(verdictFor(coverage)).toBe("verified");
  });

  // Phase 6AK — an unaccounted television is a SHORTFALL, not an invention, so
  // the picture is still shown as a partial arrangement with the gap named.
  it("reports a missing television as partial rather than verified", () => {
    const coverage = coverageOf(required, ["u_02", "u_03"]);
    expect(coverage.missing).toContain("u_01");
    expect(coverage.complete).toBe(false);
    expect(verdictFor(coverage)).toBe("partial");
  });


  it("treats duplicate units of an allowed item as faithful", () => {
    const coverage = coverageOf(required, required, ["extra cardboard box", "2x suitcases"], [
      ...inventory.map((e) => e.label),
    ]);
    expect(coverage.faithful).toBe(true);
  });

  it("never converts an unreadable check into a verified result", () => {
    expect(verdictFor(null)).toBe("unverified");
  });
});
