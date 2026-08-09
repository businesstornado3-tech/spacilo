/**
 * useStableScroll — no surprise jumps on mobile.
 *
 * Camera capture, AI results arriving and photo lists growing all change the
 * page height while someone is reading. This keeps the viewport where the
 * person left it when content changes underneath them, and only moves it when
 * the user deliberately changes step — or when new content genuinely needs to
 * be seen.
 *
 * Why this is more than one `scrollTo`:
 *   - Opening a file picker or the camera can make the browser jump the page
 *     itself. If we were still recording scroll positions at that moment we
 *     would faithfully "restore" the jump. `mark()` snapshots the real reading
 *     position before the picker opens, and `hold()` freezes recording while
 *     it puts the page back.
 *   - Newly added photos decode and reflow over several frames, so restoring
 *     once is not enough. `hold()` keeps the position for a short window.
 */
import * as React from "react";

/** How long the reading position is defended after an async content change. */
export const HOLD_WINDOW_MS = 900;

export function useStableScroll(watched: unknown) {
  const anchor = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef(0);
  const first = React.useRef(true);
  /** Non-zero while the reading position is being defended. */
  const holdUntil = React.useRef(0);

  // Remember where the user was, continuously and cheaply — but never while we
  // are actively restoring, or we would record our own correction.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const remember = () => {
      if (holdUntil.current === 0) previous.current = window.scrollY;
    };
    remember();
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  /** Snapshot the reading position before an interaction that may move it. */
  const mark = React.useCallback(() => {
    if (typeof window === "undefined") return;
    previous.current = window.scrollY;
  }, []);

  /** Defends the reading position while content reflows underneath it. */
  const hold = React.useCallback((ms: number = HOLD_WINDOW_MS) => {
    if (typeof window === "undefined") return;
    const target = previous.current;
    holdUntil.current = Date.now() + ms;
    const restore = () => {
      if (holdUntil.current === 0) return;
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo({ top: target });
      if (Date.now() < holdUntil.current) requestAnimationFrame(restore);
      else holdUntil.current = 0;
    };
    requestAnimationFrame(restore);
  }, []);

  /**
   * Brings something the user now needs — the photos they just added and the
   * button that acts on them — into view, without ever going to the top.
   */
  const reveal = React.useCallback((node: HTMLElement | null) => {
    if (!node || typeof window === "undefined") return;
    holdUntil.current = 0;
    const box = node.getBoundingClientRect();
    const off = box.top < 0 || box.bottom > window.innerHeight;
    if (off) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // A deliberate step change brings the section heading into view — once.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = anchor.current;
    if (!node || typeof window === "undefined") return;
    holdUntil.current = 0;
    const box = node.getBoundingClientRect();
    if (box.top < 0 || box.top > window.innerHeight * 0.5) {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [watched]);

  return { anchor, hold, mark, reveal };
}
