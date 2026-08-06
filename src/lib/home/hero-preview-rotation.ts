/**
 * Presentational rotation rules for the illustrative hero result panel.
 * Pure data + timing — no AI, no camera, no network.
 */
export type HeroExampleId = "renter" | "host";

/** Order the illustrative examples cycle through. */
export const HERO_EXAMPLE_ORDER: HeroExampleId[] = ["renter", "host"];

/** The example shown when the homepage first loads. */
export const HERO_DEFAULT_EXAMPLE: HeroExampleId = "renter";

/** Time each example stays on screen during automatic rotation. */
export const HERO_ROTATION_MS = 5000;

/** Longer pause after a visitor manually picks a side, before auto-rotation resumes. */
export const HERO_RESUME_AFTER_MANUAL_MS = 10000;

/** Cross-fade duration; kept in the restrained 250–400ms band. */
export const HERO_TRANSITION_MS = 300;

/** Next example in the cycle. */
export function nextHeroExample(current: HeroExampleId): HeroExampleId {
  const index = HERO_EXAMPLE_ORDER.indexOf(current);
  return HERO_EXAMPLE_ORDER[(index + 1) % HERO_EXAMPLE_ORDER.length]!;
}

/**
 * How long to wait before the next automatic switch. A manual selection
 * restarts the timer with a longer grace period so we never fight the user.
 */
export function heroRotationDelay(manuallySelected: boolean): number {
  return manuallySelected ? HERO_RESUME_AFTER_MANUAL_MS : HERO_ROTATION_MS;
}

/** Auto-rotation only runs when nothing asks us to hold still. */
export function shouldAutoRotate({
  hovered,
  documentHidden,
  reducedMotion,
}: {
  hovered: boolean;
  documentHidden: boolean;
  reducedMotion: boolean;
}): boolean {
  return !hovered && !documentHidden && !reducedMotion;
}
