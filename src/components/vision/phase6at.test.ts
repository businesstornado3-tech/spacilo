/**
 * Phase 6AT — Your Stuff image selection / crop UX.
 *
 * Your Space already lets people draw round the area that matters. These tests
 * lock the same affordances onto Your Stuff, and guard the promise that
 * changing a crop never triggers analysis by itself.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  fullSelection,
  isFullPhoto,
  isUsableSelection,
  rectSelection,
  selectionCoverage,
} from "@/lib/vision/selection";

const gallery = readFileSync("src/components/vision/PhotoGallery.tsx", "utf8");
const studio = readFileSync(
  "src/components/spaceplanner/photo/SpacePlannerStudio.tsx",
  "utf8",
);
const stuffBlock = studio.slice(
  studio.indexOf("photos={stuff.photos}"),
  studio.indexOf("photos={space.photos}"),
);
const spaceBlock = studio.slice(studio.indexOf("photos={space.photos}"));

describe("phase 6AT — Your Stuff selection UX", () => {
  it("TEST 1 — uploading a Your Stuff photo still works", () => {
    expect(stuffBlock).toContain("onReplace={stuff.replacePhoto}");
    expect(studio).toContain("stuff.addFiles(files)");
  });

  it("TEST 2 — full-photo analysis remains the default", () => {
    const whole = fullSelection("p1");
    expect(isFullPhoto(whole)).toBe(true);
    expect(isUsableSelection(whole)).toBe(true);
  });

  it("TEST 3 — the user can select an area on a stuff photo", () => {
    expect(stuffBlock).toContain("onSelectRegion={(id: string) => setSelectingStuff(id)}");
    expect(studio).toContain("photoId={stuffPhotoBeingSelected.id}");
  });

  it("TEST 4 — a confirmed crop becomes what belongings analysis sees", () => {
    expect(studio).toContain('stuff.setScope("selected")');
    const crop = rectSelection("p1", { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.6 });
    expect(isFullPhoto(crop)).toBe(false);
    expect(selectionCoverage(crop)).toBeCloseTo(0.2, 5);
    expect(isUsableSelection(crop)).toBe(true);
  });

  it("TEST 5 — the user can reset to the entire photo", () => {
    expect(gallery).toContain('label="Use entire photo"');
    expect(stuffBlock).toContain("stuff.setSelection(null, id)");
  });

  it("TEST 6 — retake is still offered", () => {
    expect(gallery).toContain('label="Retake photo"');
  });

  it("TEST 7 — replace / re-upload is offered", () => {
    expect(gallery).toContain('label="Replace photo"');
  });

  it("TEST 8 — changing the crop never calls analysis", () => {
    const selectionHandlers = [
      stuffBlock.slice(stuffBlock.indexOf("onUseWholePhoto"), stuffBlock.indexOf("selectedPhotoIds")),
      studio.slice(studio.indexOf("stuff.setSelection(selection"), studio.indexOf("setSelectingStuff(null);\n                    }")),
    ].join("\n");
    expect(selectionHandlers).not.toContain("analyse");
    expect(studio).toContain("onClick={() => void analyseStuff()}");
  });

  it("TEST 9 — 6AS empty-result and error handling is untouched", () => {
    expect(studio).toContain("stuff.emptyResult");
    expect(studio).toContain("We couldn't analyse this photo.");
    expect(studio).toContain("disabled={!hydrated}");
  });

  it("TEST 10 — Your Space selection behaviour is unchanged", () => {
    expect(spaceBlock).toContain("onSelectRegion={(id) => setSelectingSpace(id)}");
    expect(spaceBlock).not.toContain("onUseWholePhoto");
    expect(studio).toContain('wholeLabel="Use the whole space"');
  });
});
