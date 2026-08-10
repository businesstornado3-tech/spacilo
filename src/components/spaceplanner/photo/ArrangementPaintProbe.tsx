/**
 * Phase 6Y — the paint probe.
 *
 * "The arrangement is ready" and "the user can see the arrangement" are not
 * the same moment, and the difference is exactly what a performance claim
 * lives or dies on. This component mounts alongside the arrangement diagram
 * and reports the frame AFTER the browser has painted it — two nested
 * animation frames, which is the standard way to land on the far side of a
 * paint without a Long Animation Frame observer.
 *
 * It renders nothing and never affects layout.
 */
import * as React from "react";

export function ArrangementPaintProbe({ onPainted }: { onPainted: () => void }) {
  React.useLayoutEffect(() => {
    if (typeof requestAnimationFrame !== "function") {
      onPainted();
      return;
    }
    let second = 0;
    // First frame: the commit we are part of. Second: after it has painted.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onPainted());
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [onPainted]);

  return null;
}

export default ArrangementPaintProbe;
