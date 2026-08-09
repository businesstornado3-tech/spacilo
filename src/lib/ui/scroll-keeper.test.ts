/**
 * Phase 6R — upload must never throw the reader back to the top of the page.
 *
 * The failure these cover is the real one seen in testing: opening the camera
 * or file picker moves the page, the scroll listener records that jump as the
 * user's position, and "restoring" then cements it at zero.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createScrollKeeper } from "@/lib/ui/scroll-keeper";

interface FakeWindow {
  scrollY: number;
  innerHeight: number;
  scrollTo: (options: { top: number }) => void;
  requestAnimationFrame: (callback: () => void) => number;
}

function fakeWindow(): FakeWindow {
  const win: FakeWindow = {
    scrollY: 0,
    innerHeight: 800,
    scrollTo: ({ top }) => {
      win.scrollY = top;
    },
    requestAnimationFrame: (callback) =>
      setTimeout(callback, 16) as unknown as number,
  };
  return win;
}

describe("scroll keeper", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("puts the reader back where they were after an upload reflow", () => {
    const win = fakeWindow();
    const keeper = createScrollKeeper(win as unknown as Window);

    win.scrollY = 1400;
    keeper.remember();

    // The picker opens: snapshot first, then the browser jumps to the top.
    keeper.mark();
    keeper.hold();
    win.scrollY = 0;
    keeper.remember();
    vi.advanceTimersByTime(120);

    expect(win.scrollY).toBe(1400);
  });

  it("ignores scroll events caused by its own correction", () => {
    const win = fakeWindow();
    const keeper = createScrollKeeper(win as unknown as Window);

    win.scrollY = 900;
    keeper.remember();
    keeper.mark();
    keeper.hold();

    win.scrollY = 0;
    keeper.remember();
    vi.advanceTimersByTime(60);
    // A second reflow later in the hold window must not win either.
    win.scrollY = 0;
    keeper.remember();
    vi.advanceTimersByTime(60);

    expect(win.scrollY).toBe(900);
  });

  it("does not move the page when nothing shifted it", () => {
    const win = fakeWindow();
    const keeper = createScrollKeeper(win as unknown as Window);
    win.scrollY = 600;
    keeper.remember();
    keeper.hold();
    vi.advanceTimersByTime(200);
    expect(win.scrollY).toBe(600);
  });

  it("stops defending once the hold window has passed", () => {
    const win = fakeWindow();
    const keeper = createScrollKeeper(win as unknown as Window);
    win.scrollY = 500;
    keeper.remember();
    keeper.hold(100);
    vi.advanceTimersByTime(400);

    // The user scrolls on purpose afterwards; nothing drags them back.
    win.scrollY = 1800;
    keeper.remember();
    vi.advanceTimersByTime(200);
    expect(win.scrollY).toBe(1800);
  });

  it("reveals the next action only when it is off screen, never upward to the top", () => {
    const win = fakeWindow();
    const keeper = createScrollKeeper(win as unknown as Window);
    win.scrollY = 1200;
    keeper.remember();

    const onScreen = {
      getBoundingClientRect: () => ({ top: 100, bottom: 300 }) as DOMRect,
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;
    keeper.reveal(onScreen);
    expect(onScreen.scrollIntoView).not.toHaveBeenCalled();

    const below = {
      getBoundingClientRect: () => ({ top: 900, bottom: 1600 }) as DOMRect,
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;
    keeper.reveal(below);
    expect(below.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    // Revealing must not drag the page to the document top.
    expect(win.scrollY).toBe(1200);
  });
});
