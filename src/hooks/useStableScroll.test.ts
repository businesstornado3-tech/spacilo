/**
 * Phase 6R — upload must never throw the reader back to the top of the page.
 *
 * The failure these cover is the real one seen in testing: opening the camera
 * or file picker moves the page, the scroll listener records that jump as the
 * user's position, and "restoring" then cements it at zero.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useStableScroll } from "@/hooks/useStableScroll";

function scrollTo(y: number) {
  window.scrollY = y;
  window.dispatchEvent(new Event("scroll"));
}

describe("useStableScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    window.scrollTo = vi.fn((options?: unknown) => {
      const top = (options as { top?: number } | undefined)?.top;
      if (typeof top === "number") window.scrollY = top;
    }) as unknown as typeof window.scrollTo;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(performance.now()), 16) as unknown as number;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("puts the reader back where they were after an upload reflow", () => {
    const { result } = renderHook(() => useStableScroll("stuff"));
    act(() => scrollTo(1400));

    // The picker opens: snapshot first, then the browser jumps to the top.
    act(() => result.current.mark());
    act(() => {
      result.current.hold();
      scrollTo(0);
      vi.advanceTimersByTime(120);
    });

    expect(window.scrollY).toBe(1400);
  });

  it("ignores scroll events caused by its own correction", () => {
    const { result } = renderHook(() => useStableScroll("stuff"));
    act(() => scrollTo(900));
    act(() => result.current.mark());

    act(() => {
      result.current.hold();
      scrollTo(0);
      vi.advanceTimersByTime(60);
      // A second reflow later in the hold window must not win either.
      scrollTo(0);
      vi.advanceTimersByTime(60);
    });

    expect(window.scrollY).toBe(900);
  });

  it("does not scroll at all when nothing moved the page", () => {
    const { result } = renderHook(() => useStableScroll("stuff"));
    act(() => scrollTo(600));
    act(() => {
      result.current.hold();
      vi.advanceTimersByTime(200);
    });
    expect(window.scrollY).toBe(600);
  });

  it("reveals the next action only when it is off screen, and never upward to the top", () => {
    const { result } = renderHook(() => useStableScroll("stuff"));
    act(() => scrollTo(1200));

    const onScreen = document.createElement("div");
    onScreen.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect;
    onScreen.scrollIntoView = vi.fn();
    act(() => result.current.reveal(onScreen));
    expect(onScreen.scrollIntoView).not.toHaveBeenCalled();

    const below = document.createElement("div");
    below.getBoundingClientRect = () => ({ top: 900, bottom: 1600 }) as DOMRect;
    below.scrollIntoView = vi.fn();
    act(() => result.current.reveal(below));
    expect(below.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    // Revealing must not drag the page to the document top.
    expect(window.scrollY).toBe(1200);
  });
});
