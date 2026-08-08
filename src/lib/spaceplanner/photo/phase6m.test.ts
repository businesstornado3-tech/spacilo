/**
 * Phase 6M — OpenAI renderer migration guarantees.
 *
 * These tests pin the architectural rules rather than the wording of a prompt:
 * the renderer is OpenAI, Gemini is gone from this path, the manifest is an
 * exhaustive whitelist, and an unverifiable render is never called verified.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildRenderPrompt,
  coverageOf,
  verdictFor,
  blobFromBase64,
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

describe("provider migration", () => {
  it("renders through OpenAI, not the Lovable gateway", () => {
    expect(source).toContain("https://api.openai.com/v1");
    expect(source).toContain("/images/edits");
    expect(source).toContain('const PROVIDER = "openai"');
  });

  it("no longer references Gemini or the gateway anywhere in the render path", () => {
    expect(source).not.toMatch(/gemini/i);
    expect(source).not.toContain("ai.gateway.lovable.dev");
    expect(source).not.toContain("LOVABLE_API_KEY");
  });

  it("reads the API key server-side only and never falls back", () => {
    expect(source).toContain('process.env["OPENAI_API_KEY"]');
    expect(source).not.toMatch(/import\.meta\.env[^\n]*OPENAI/);
    expect(source).toContain('error: "not_configured"');
  });

  it("edits the user's own photograph rather than generating a new room", () => {
    expect(source).toContain('form.append(\n          "image[]"');
    expect(source).toContain('form.append("input_fidelity", "high")');
  });

  it("reports provider, model and plan hash for diagnostics", () => {
    expect(source).toContain("provider: PROVIDER");
    expect(source).toContain("diagnosticId");
    expect(source).toContain("planHash");
    expect(source).toContain("renderMs");
  });

  it("converts base64 photographs into multipart blobs", () => {
    const blob = blobFromBase64("aGVsbG8=", "image/png");
    expect(blob.size).toBe(5);
    expect(blob.type).toBe("image/png");
  });
});

describe("zero invention", () => {
  it("gives the model an exhaustive per-unit whitelist", () => {
    const text = prompt();
    expect(text).toContain("u_01 = 1 × Television");
    expect(text).toContain("u_02 = 2 × Suitcase");
    expect(text).toContain("u_03 = 3 × Cardboard box");
    expect(text).toContain("exhaustive per-unit whitelist");
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

  it("reports a missing television as incomplete rather than verified", () => {
    const coverage = coverageOf(required, ["u_02", "u_03"]);
    expect(coverage.missing).toContain("u_01");
    expect(verdictFor(coverage)).toBe("incomplete");
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
