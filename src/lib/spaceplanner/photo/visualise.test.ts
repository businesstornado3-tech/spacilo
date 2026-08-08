/**
 * SpacePlanner visualisation tests — the image must be real, or absent.
 */
import { describe, expect, it } from "vitest";

import {
  buildVisualisationInstruction,
  requestVisualisation,
  VISUALISATION_STAGES,
  VisualisationError,
} from "./visualise";
import { buildPhotoPlan, type SpaceSource } from "./plan";
import { extractImage } from "@/routes/api/spaceplanner-visualise";
import type { DetectedObject } from "@/lib/vision/types";

const crib: DetectedObject = {
  id: "obj-crib",
  label: "Bedside crib",
  category: "furniture",
  confidence: 0.82,
  width: 90,
  depth: 55,
  height: 80,
  weight: "light",
  quantity: 1,
  fragile: false,
  stackable: false,
  source: "ai",
} as DetectedObject;

const source: SpaceSource = {
  widthM: 3,
  depthM: 5,
  heightM: 2.4,
  basis: "photo",
  confidence: 0.7,
  name: "Your space",
};

const result = buildPhotoPlan([crib], source);

describe("SpacePlanner fit analysis", () => {
  it("detects the item and produces a fit result", () => {
    expect(result.itemCount).toBeGreaterThan(0);
    expect(result.fitPercent).toBeGreaterThan(0);
    expect(result.spaceRemainingM3).toBeGreaterThan(0);
  });
});

describe("visualisation instruction", () => {
  it("names the real item, its size and the recommended placement", () => {
    const instruction = buildVisualisationInstruction(result, [crib]);
    expect(instruction).toContain("Bedside crib");
    expect(instruction).toContain("90×55×80cm");
    expect(instruction).toMatch(/wall|centre/);
  });

  it("exposes the three progressive loading stages", () => {
    expect(VISUALISATION_STAGES.map((stage) => stage.id)).toEqual([
      "analysing",
      "placing",
      "rendering",
    ]);
  });
});

const payload = { spaceImage: { mimeType: "image/jpeg", base64: "aaa" }, itemImages: [], instruction: "x" };

describe("requestVisualisation", () => {
  it("returns the edited photograph on success", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ image: "data:image/png;base64,zzz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    await expect(requestVisualisation(payload, fake)).resolves.toBe("data:image/png;base64,zzz");
  });

  it("fails rather than returning a placeholder when no image comes back", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: "no_image_returned" }), { status: 502 })) as unknown as typeof fetch;
    await expect(requestVisualisation(payload, fake)).rejects.toBeInstanceOf(VisualisationError);
  });

  it("fails when the endpoint answers ok but without an image", async () => {
    const fake = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
    await expect(requestVisualisation(payload, fake)).rejects.toMatchObject({
      code: "no_image_returned",
    });
  });
});

describe("extractImage", () => {
  it("finds base64 image payloads", () => {
    expect(extractImage({ data: [{ b64_json: "abc" }] })).toBe("data:image/png;base64,abc");
  });

  it("finds inline data urls in chat-shaped responses", () => {
    expect(
      extractImage({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,q" } }] } }] }),
    ).toBe("data:image/png;base64,q");
  });

  it("returns null when the response carries no image", () => {
    expect(extractImage({ choices: [{ message: { content: "sorry" } }] })).toBeNull();
  });
});
