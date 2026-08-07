/**
 * Rotation rules for the homepage Spacilo Earnings Estimator tabs.
 * Pure data + timing — presentational only.
 */
export type EarningsTabId = "quick" | "scan";

/** Left-to-right tab order. Quick estimate leads: value before AI. */
export const EARNINGS_TAB_ORDER: EarningsTabId[] = ["quick", "scan"];

/** The tab selected when the section first renders. */
export const EARNINGS_DEFAULT_TAB: EarningsTabId = "quick";

/** Dwell time per tab during automatic rotation. */
export const EARNINGS_ROTATION_MS = 6000;

/** Cross-fade duration; premium band, no layout shift. */
export const EARNINGS_TRANSITION_MS = 300;

/** Next tab in the loop. */
export function nextEarningsTab(current: EarningsTabId): EarningsTabId {
  const index = EARNINGS_TAB_ORDER.indexOf(current);
  return EARNINGS_TAB_ORDER[(index + 1) % EARNINGS_TAB_ORDER.length]!;
}

/**
 * Auto-rotation only runs while the section is on screen, the page is
 * visible, motion is welcome, and the visitor has not taken control.
 */
export function shouldRotateEarnings({
  inView,
  documentHidden,
  reducedMotion,
  userEngaged,
}: {
  inView: boolean;
  documentHidden: boolean;
  reducedMotion: boolean;
  userEngaged: boolean;
}): boolean {
  return inView && !documentHidden && !reducedMotion && !userEngaged;
}
