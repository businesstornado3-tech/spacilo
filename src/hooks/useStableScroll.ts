/**
 * useStableScroll — no surprise jumps on mobile.
 *
 * Camera capture, AI results arriving and photo lists growing all change the
 * page height while someone is reading. This keeps the viewport where the
 * person left it when content changes underneath them, and only moves it when
 * the user deliberately changes step.
 */
import * as React from "react";

export function useStableScroll(watched: unknown) {
  const anchor = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef(0);
  const first = React.useRef(true);

  // Remember where the user was, continuously and cheaply.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const remember = () => {
      previous.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  /** Restores the reading position after an async update reflows the page. */
  const hold = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const target = previous.current;
    requestAnimationFrame(() => window.scrollTo({ top: target }));
  }, []);

  // A deliberate step change brings the section heading into view — once.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const node = anchor.current;
    if (!node || typeof window === "undefined") return;
    const box = node.getBoundingClientRect();
    if (box.top < 0 || box.top > window.innerHeight * 0.5) {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [watched]);

  return { anchor, hold };
}
