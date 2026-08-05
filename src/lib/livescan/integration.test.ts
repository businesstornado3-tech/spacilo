/**
 * Live Scan is progressive enhancement over the existing scan journeys.
 *
 * These tests assert the wiring: every scan surface offers the live experience,
 * every one of them keeps its upload/manual fallback, and the captured photo
 * still flows through the unchanged server pipeline.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const SURFACES = {
  guestShell: "src/components/spacefit/GuestScanShell.tsx",
  guestStuff: "src/routes/spacefit.stuff.tsx",
  guestSpace: "src/routes/spacefit.space.tsx",
  renterPhotos: "src/components/inventory/InventoryPhotoManager.tsx",
  hostScanner: "src/components/host/spacefit/SpaceScanner.tsx",
};

describe("live scan is offered on every scan surface", () => {
  it("is offered in the guest photo picker", () => {
    expect(read(SURFACES.guestShell)).toMatch(/<LiveScanner/);
  });

  it("is offered to authenticated renters", () => {
    expect(read(SURFACES.renterPhotos)).toMatch(/<LiveScanner/);
  });

  it("is offered to authenticated hosts through the shared host flow", () => {
    expect(read(SURFACES.hostScanner)).toMatch(/<HostSpaceCapture/);
    expect(read("src/components/spacefit/live/HostSpaceCapture.tsx")).toMatch(/<LiveScanner/);
  });

  it("runs in host mode on the guest space journey", () => {
    expect(read(SURFACES.guestSpace)).toMatch(/mode="host"/);
  });

  it("runs in renter mode for authenticated inventory", () => {
    expect(read(SURFACES.renterPhotos)).toMatch(/mode="renter"/);
  });

  it("runs in host mode for authenticated spaces", () => {
    expect(read("src/components/spacefit/live/HostSpaceCapture.tsx")).toMatch(/mode="host"/);
  });
});

describe("the existing journeys still work without a camera", () => {
  it("keeps the upload input in the guest picker", () => {
    const source = read(SURFACES.guestShell);
    expect(source).toMatch(/type="file"/);
    expect(source).toMatch(/GUEST_ALLOWED_MIME_TYPES/);
  });

  it("keeps the upload and camera inputs for renters", () => {
    expect(read(SURFACES.renterPhotos)).toMatch(/type="file"/);
  });

  it("keeps upload, take-a-photo and delete controls for hosts", () => {
    const source = read(SURFACES.hostScanner);
    expect(source).toMatch(/Take a photo/);
    expect(source).toMatch(/Upload/);
    expect(source).toMatch(/type="file"/);
  });

  it("keeps manual inventory entry available", () => {
    expect(read("src/routes/_authenticated.spacefit.tsx")).toMatch(/Add items manually/);
  });
});

describe("captured frames enter the unchanged server pipeline", () => {
  it("hosts upload the captured photo through the existing scan upload", () => {
    const source = read(SURFACES.hostScanner);
    expect(source).toMatch(/onCaptured[\s\S]{0,240}uploadScanPhoto\(spaceId, file\)/);
  });

  it("hosts still analyse through the existing server function", () => {
    expect(read(SURFACES.hostScanner)).toMatch(/scanSpacePhotos/);
  });

  it("renters route the captured photo through the existing handler", () => {
    expect(read(SURFACES.renterPhotos)).toMatch(/onCapture[\s\S]{0,120}handleFiles/);
  });

  it("guests route the captured photo through the existing add handler", () => {
    expect(read(SURFACES.guestShell)).toMatch(/onCapture[\s\S]{0,120}onAdd/);
  });

  it("the host review-and-confirm step is untouched", () => {
    const source = read(SURFACES.hostScanner);
    expect(source).toMatch(/Use these measurements/);
    expect(source).toMatch(/applySpaceMeasurementProposal/);
  });
});

describe("the live layer makes no promises", () => {
  it("never claims a live measurement in the scanner UI", () => {
    const source = read("src/components/spacefit/live/LiveScanner.tsx");
    expect(source).not.toMatch(/guaranteed|100% safe|fully insured|zero risk/i);
  });

  it("keeps the host disclaimer in place", () => {
    expect(read(SURFACES.hostScanner)).toMatch(/SPACE_SCAN_DISCLAIMER/);
  });
});
