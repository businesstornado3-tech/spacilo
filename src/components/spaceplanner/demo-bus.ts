/**
 * Tiny event bus between the hero CTAs and the interactive demo.
 *
 * Keeps the hero free of demo state while letting "Try SpacePlanner™" and
 * "Watch live demo" scroll to, and start, the real simulation.
 */
export const DEMO_ANCHOR_ID = "spaceplanner-demo";
const START_EVENT = "earnroom:spaceplanner-start";

export function scrollToDemo() {
  if (typeof document === "undefined") return;
  const target = document.getElementById(DEMO_ANCHOR_ID);
  if (!target) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/** Scrolls to the demo and asks it to run the planner immediately. */
export function startDemo() {
  scrollToDemo();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_EVENT));
}

export function onStartDemo(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(START_EVENT, handler);
  return () => window.removeEventListener(START_EVENT, handler);
}
