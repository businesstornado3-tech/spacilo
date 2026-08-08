/**
 * SpacePlanner visualisation tests — the image must be real, complete, or
 * honestly reported as neither.
 */
import { describe, expect, it } from "vitest";

import {
  buildVisualisationInstruction,
  clearVisualisationCache,
  manifestPayload,
  requestVisualisation,
  visualisationSignature,
  VISUALISATION_STAGES,
  VisualisationError,
} from "./visualise";
import {
  buildPlacementManifest,
  coverageFrom,
  formatManifestForModel,
  inventorySignature,
  lockInventory,
  requiredLabels,
} from "./manifest";
import { scaleFor } from "./image-optimise";
import { buildPhotoPlan, type SpaceSource } from "./plan";
import { coverageOf, extractImage, parsePresentLabels } from "@/routes/api/spaceplanner-visualise";
import type { DetectedObject } from "@/lib/vision/types";

const object = (patch: Partial<DetectedObject> & { id: string; label: string }): DetectedObject =>
  ({
    category: "furniture",
    confidence: 0.82,
    width: 90,
    depth: 55,
    height: 80,
    weight: "light",
    quantity: 1,
    fragile: false,
    stackable: false,
    catalogueId: null,
    photoIds: [],
    source: "ai",
    ...patch,
  }) as DetectedObject;

const crib = object({ id: "obj-crib", label: "Bedside crib" });
const suitcases = object({ id: "obj-case", label: "Large suitcase", quantity: 2, width: 70, depth: 45, height: 25 });

const source: SpaceSource = {
  widthM: 3,
  depthM: 5,
  heightM: 2.4,
  basis: "photo",
  confidence: 0.7,
  name: "Your space",
};

const result = buildPhotoPlan([crib], source)!;

describe("SpacePlanner fit analysis", () => {
  it("detects the item and produces a fit result", () => {
    expect(result.itemCount).toBeGreaterThan(0);
    expect(result.fitPercent).toBeGreaterThan(0);
    expect(result.spaceRemainingM3).toBeGreaterThan(0);
  });
});

describe("inventory lock", () => {
  it("creates a canonical inventory with stable signature", () => {
    const a = lockInventory([crib, suitcases]);
    const b = lockInventory([suitcases, crib]);
    expect(a.signature).toBe(b.signature);
    expect(a.distinctItems).toBe(2);
    expect(a.itemCount).toBe(3);
  });

  it("changes signature when the user corrects a quantity", () => {
    const before = inventorySignature([suitcases]);
    const after = inventorySignature([{ ...suitcases, quantity: 3 }]);
    expect(before).not.toBe(after);
  });

  it("drops empty or zero-quantity entries rather than planning them", () => {
    const locked = lockInventory([crib, { ...suitcases, quantity: 0 }]);
    expect(locked.distinctItems).toBe(1);
  });

  it("uses the corrected inventory downstream", () => {
    const corrected = lockInventory([{ ...suitcases, quantity: 2 }]);
    const plan = buildPhotoPlan(corrected.objects, source)!;
    const manifest = buildPlacementManifest(corrected, plan);
    expect(manifest.expectedUnits).toBe(2);
    expect(manifest.entries[0]!.quantity).toBe(2);
  });
});

describe("placement manifest", () => {
  const inventory = lockInventory([crib, suitcases]);
  const plan = buildPhotoPlan(inventory.objects, source)!;
  const manifest = buildPlacementManifest(inventory, plan);

  it("lists every confirmed item — nothing is silently removed", () => {
    expect(manifest.entries).toHaveLength(2);
    expect(requiredLabels(manifest)).toContain("Bedside crib");
    expect(requiredLabels(manifest)).toContain("Large suitcase");
  });

  it("gives every entry a placement state", () => {
    for (const entry of manifest.entries) expect(entry.state).toBeTruthy();
  });

  it("formats a structured manifest, not a loose summary", () => {
    const text = formatManifestForModel(manifest);
    expect(text).toContain("ITEM 1:");
    expect(text).toContain("Quantity: 1");
    expect(text).toContain("Placement:");
    expect(text).toContain("Orientation:");
  });

  it("ties the manifest to the canonical inventory id", () => {
    expect(manifest.inventoryId).toBe(inventory.id);
  });
});

describe("coverage", () => {
  it("reports completeness", () => {
    expect(coverageFrom(["TV", "Crib"], ["tv", "crib"]).complete).toBe(true);
  });

  it("names missing items", () => {
    const report = coverageFrom(["TV", "Crib"], ["TV"]);
    expect(report.complete).toBe(false);
    expect(report.missing).toEqual(["Crib"]);
    expect(report.present).toBe(1);
  });

  it("matches the server-side calculation", () => {
    expect(coverageOf(["TV", "Crib"], ["TV"])).toEqual(coverageFrom(["TV", "Crib"], ["TV"]));
  });
});

describe("visualisation instruction", () => {
  it("names the real item, its size and the recommended placement", () => {
    const instruction = buildVisualisationInstruction(result, [crib]);
    expect(instruction).toContain("Bedside crib");
    expect(instruction).toContain("90×55×80cm");
    expect(instruction).toMatch(/wall|centre/);
  });

  it("carries the structured manifest when one is supplied", () => {
    const inventory = lockInventory([crib]);
    const plan = buildPhotoPlan(inventory.objects, source)!;
    const manifest = buildPlacementManifest(inventory, plan);
    const instruction = buildVisualisationInstruction(plan, inventory.objects, manifest);
    expect(instruction).toContain("ITEM 1:");
    expect(instruction).toContain("EVERY item in this manifest");
  });

  it("exposes progressive loading stages in user language", () => {
    expect(VISUALISATION_STAGES.map((stage) => stage.id)).toEqual([
      "reading",
      "identifying",
      "sizing",
      "space",
      "fitting",
      "planning",
      "rendering",
      "checking",
    ]);
    for (const stage of VISUALISATION_STAGES) expect(stage.label).not.toMatch(/api|model|token/i);
  });

  it("sends the manifest payload the endpoint validates against", () => {
    const inventory = lockInventory([crib, suitcases]);
    const plan = buildPhotoPlan(inventory.objects, source)!;
    const payload = manifestPayload(buildPlacementManifest(inventory, plan));
    expect(payload).toEqual([
      { label: "Bedside crib", quantity: 1 },
      { label: "Large suitcase", quantity: 2 },
    ]);
  });
});

const payload = {
  spaceImage: { mimeType: "image/jpeg", base64: "aaa" },
  itemImages: [],
  instruction: "x",
};

describe("requestVisualisation", () => {
  it("returns the edited photograph on success", async () => {
    clearVisualisationCache();
    const fake = (async () =>
      new Response(JSON.stringify({ image: "data:image/png;base64,zzz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    await expect(requestVisualisation(payload, fake)).resolves.toMatchObject({
      image: "data:image/png;base64,zzz",
    });
  });

  it("serves an identical request from the session cache without calling again", async () => {
    clearVisualisationCache();
    let calls = 0;
    const fake = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ image: "data:image/png;base64,zzz" }), { status: 200 });
    }) as unknown as typeof fetch;
    await requestVisualisation(payload, fake);
    await requestVisualisation(payload, fake);
    expect(calls).toBe(1);
  });

  it("treats a different emphasis as a different request", () => {
    expect(visualisationSignature(payload)).not.toBe(
      visualisationSignature({ ...payload, emphasise: ["Crib"] }),
    );
  });

  it("surfaces coverage from the endpoint", async () => {
    clearVisualisationCache();
    const fake = (async () =>
      new Response(
        JSON.stringify({
          image: "data:image/png;base64,q",
          coverage: { expected: 2, present: 1, missing: ["Crib"], complete: false },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const response = await requestVisualisation({ ...payload, instruction: "y" }, fake);
    expect(response.coverage?.complete).toBe(false);
  });

  it("fails rather than returning a placeholder when no image comes back", async () => {
    clearVisualisationCache();
    const fake = (async () =>
      new Response(JSON.stringify({ error: "no_image_returned" }), {
        status: 502,
      })) as unknown as typeof fetch;
    await expect(requestVisualisation(payload, fake)).rejects.toBeInstanceOf(VisualisationError);
  });

  it("fails when the endpoint answers ok but without an image", async () => {
    clearVisualisationCache();
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

describe("coverage check parsing", () => {
  it("reads a JSON array reply", () => {
    expect(parsePresentLabels('["TV","Crib"]')).toEqual(["TV", "Crib"]);
  });

  it("reads a fenced reply", () => {
    expect(parsePresentLabels('```json\n["TV"]\n```')).toEqual(["TV"]);
  });

  it("returns null when the checker did not answer usefully", () => {
    expect(parsePresentLabels("I cannot tell")).toBeNull();
  });
});

describe("image optimisation", () => {
  it("scales large camera photos down to the long edge", () => {
    expect(scaleFor(4032, 3024, 1280)).toBeCloseTo(1280 / 4032);
  });

  it("never scales a small photo up", () => {
    expect(scaleFor(800, 600, 1280)).toBe(1);
  });
});
