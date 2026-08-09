/**
 * useStableScroll — no surprise jumps on mobile.
 *
 * Camera capture, AI results arriving and photo lists growing all change the
 * page height while someone is reading. This keeps the viewport where the
 * person left it when content changes underneath them, and only moves it when
 * the user deliberately changes step — or when new content genuinely needs to
 * be seen.
 *
 * The mechanics live in {@link createScrollKeeper} so they can be tested
 * directly; this hook only binds them to the component lifecycle.
 */
import * as React from "react";

import { createScrollKeeper, type ScrollKeeper } from "@/lib/ui/scroll-keeper";

export { HOLD_WINDOW_MS } from "@/lib/ui/scroll-keeper";

export function useStableScroll(watched: unknown) {
  const anchor = React.useRef<HTMLDivElement>(null);
  const keeper = React.useRef<ScrollKeeper | null>(null);
  const first = React.useRef(true);

  const get = React.useCallback((): ScrollKeeper | null => {
    if (typeof window === "undefined") return null;
    keeper.current ??= createScrollKeeper(window);
    return keeper.current;
  }, []);

  // Remember where the user was, continuously and cheaply.
  React.useEffect(() => {
    const instance = get();
    if (!instance) return;
    const remember = () => instance.remember();
    remember();
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, [get]);

  /** Snapshot the reading position before an interaction that may move it. */
  const mark = React.useCallback(() => get()?.mark(), [get]);

  /** Defends the reading position while content reflows underneath it. */
  const hold = React.useCallback((ms?: number) => get()?.hold(ms), [get]);

  /**
   * Brings something the user now needs — the photos they just added and the
   * button that acts on them — into view, without ever going to the top.
   */
  const reveal = React.useCallback(
    (node: HTMLElement | null) => get()?.reveal(node),
    [get],
  );

  // A deliberate step change brings the section heading into view — once.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = anchor.current;
    const instance = get();
    if (!node || !instance) return;
    instance.release();
    const box = node.getBoundingClientRect();
    if (box.top < 0 || box.top > window.innerHeight * 0.5) {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [watched, get]);

  return { anchor, hold, mark, reveal };
}
