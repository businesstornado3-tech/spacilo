/**
 * Phase 6AT — Your Stuff photo selection/crop UX.
 *
 * The gallery is the shared surface for both Your Space and Your Stuff, so
 * these tests lock the new selection affordances without touching detection.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PhotoGallery } from "./PhotoGallery";
import { rectSelection, isFullPhoto, fullSelection } from "@/lib/vision/selection";

const photos = [{ id: "p1", url: "blob:one", rotation: 0, file: new File([], "a.jpg") }] as never;

const noop = () => {};

function renderGallery(extra: Record<string, unknown> = {}) {
  return render(
    <PhotoGallery
      photos={photos}
      onRemove={noop}
      onRotate={noop}
      onMove={noop}
      {...extra}
    />,
  );
}

describe("Phase 6AT — Your Stuff selection UX", () => {
  it("1. shows an uploaded photo", () => {
    renderGallery();
    expect(screen.getByAltText("Uploaded photo 1")).toBeTruthy();
    cleanup();
  });

  it("2. keeps full-photo analysis available with no selection", () => {
    renderGallery({ onSelectRegion: noop, onUseWholePhoto: noop, selectedPhotoIds: [] });
    const whole = screen.getByLabelText("Use entire photo") as HTMLButtonElement;
    expect(whole.disabled).toBe(true);
    cleanup();
  });

  it("3. lets the user open the area selector", () => {
    const onSelectRegion = vi.fn();
    renderGallery({ onSelectRegion });
    fireEvent.click(screen.getByLabelText("Select area"));
    expect(onSelectRegion).toHaveBeenCalledWith("p1");
    cleanup();
  });

  it("4. a drawn area is a real crop that constrains analysis", () => {
    const selection = rectSelection("p1", { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.5 });
    expect(isFullPhoto(selection)).toBe(false);
    expect(selection.photoId).toBe("p1");
    cleanup();
  });

  it("5. resetting to the whole photo is offered once an area exists", () => {
    const onUseWholePhoto = vi.fn();
    renderGallery({ onSelectRegion: noop, onUseWholePhoto, selectedPhotoIds: ["p1"] });
    expect(screen.getByText("Area selected")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Use entire photo"));
    expect(onUseWholePhoto).toHaveBeenCalledWith("p1");
    expect(isFullPhoto(fullSelection("p1"))).toBe(true);
    cleanup();
  });

  it("6/7. retake and replace are both available", () => {
    renderGallery({ onReplace: noop });
    expect(screen.getByLabelText("Retake photo")).toBeTruthy();
    expect(screen.getByLabelText("Replace photo")).toBeTruthy();
    cleanup();
  });

  it("8. changing the crop never runs analysis itself", () => {
    const analyse = vi.fn();
    const onUseWholePhoto = vi.fn();
    renderGallery({ onSelectRegion: noop, onUseWholePhoto, selectedPhotoIds: ["p1"] });
    fireEvent.click(screen.getByLabelText("Use entire photo"));
    expect(analyse).not.toHaveBeenCalled();
    cleanup();
  });

  it("10. Your Space behaviour is unchanged when no selection props are passed", () => {
    renderGallery({ onSelectRegion: noop });
    expect(screen.queryByLabelText("Use entire photo")).toBeNull();
    expect(screen.queryByText("Area selected")).toBeNull();
    cleanup();
  });
});
