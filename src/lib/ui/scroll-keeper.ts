/**
 * scroll-keeper — the framework-free half of {@link useStableScroll}.
 *
 * Kept out of the hook so the behaviour that actually broke in testing can be
 * exercised directly: the browser moving the page when a file picker or camera
 * opens, and content reflowing for several frames after photos are added.
 */

/** How long the reading position is defended after an async content change. */
export const HOLD_WINDOW_MS = 900;

export interface ScrollKeeper {
  /** Records a scroll event unless a correction is in progress. */
  remember(): void;
  /** Snapshots the reading position before an interaction that may move it. */
  mark(): void;
  /** Defends the reading position while content reflows underneath it. */
  hold(ms?: number): void;
  /** Stops defending — used before any deliberate movement. */
  release(): void;
  /** Brings a node into view only when it is off screen. Never scrolls to top. */
  reveal(node: HTMLElement | null): void;
}

export function createScrollKeeper(win: Window = window): ScrollKeeper {
  let previous = 0;
  let holdUntil = 0;

  const release = () => {
    holdUntil = 0;
  };

  return {
    remember() {
      if (holdUntil === 0) previous = win.scrollY;
    },
    mark() {
      previous = win.scrollY;
    },
    hold(ms = HOLD_WINDOW_MS) {
      const target = previous;
      holdUntil = Date.now() + ms;
      const restore = () => {
        if (holdUntil === 0) return;
        if (Math.abs(win.scrollY - target) > 1) win.scrollTo({ top: target });
        if (Date.now() < holdUntil) win.requestAnimationFrame(restore);
        else holdUntil = 0;
      };
      win.requestAnimationFrame(restore);
    },
    release,
    reveal(node) {
      if (!node) return;
      release();
      const box = node.getBoundingClientRect();
      if (box.top < 0 || box.bottom > win.innerHeight) {
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
  };
}
