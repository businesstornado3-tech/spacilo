/**
 * The hero result panel is illustrative only: static copy, bounded language,
 * automatic renter/host rotation, manual control, and no AI, camera or
 * data-fetching imports.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  HERO_DEFAULT_EXAMPLE,
  HERO_RESUME_AFTER_MANUAL_MS,
  HERO_ROTATION_MS,
  HERO_TRANSITION_MS,
  heroRotationDelay,
  nextHeroExample,
  shouldAutoRotate,
  type HeroExampleId,
} from "@/lib/home/hero-preview-rotation";

const preview = readFileSync("src/components/home/HeroAiPreview.tsx", "utf8");

describe("hero illustrative Spacilo AI preview", () => {
  it("shows the renter example figures", () => {
    expect(preview).toContain("14 items");
    expect(preview).toContain("~3.1 m³");
    expect(preview).toContain("94%");
  });

  it("shows the host example figures", () => {
    expect(preview).toContain("~8.4 m³");
    expect(preview).toContain("Boxes · luggage · small furniture");
    expect(preview).toContain("£45–£65*");
  });

  it("labels both states as illustrative examples", () => {
    expect(preview).toContain("Illustrative example — not your result.");
    expect(preview).toMatch(/Illustrative example — actual results depend/);
  });

  it("uses bounded language only", () => {
    expect(preview).toMatch(/Estimated|Potential/);
    expect(preview).not.toMatch(/guaranteed|exact fit|confirmed/i);
  });

  it("defaults to the renter example and lets visitors switch", () => {
    expect(HERO_DEFAULT_EXAMPLE).toBe("renter");
    expect(preview).toContain("HERO_DEFAULT_EXAMPLE");
    expect(preview).toContain("Host example");
  });

  it("implies no live processing", () => {
    expect(preview).not.toMatch(/scanning|analysing|analyzing|processing|loading/i);
    expect(preview).not.toMatch(/getUserMedia/);
  });

  it("imports no AI, camera, scanner, admin or data modules", () => {
    expect(preview).not.toMatch(/livescan|LiveScanner|BoundaryEditor|SpaceScanner/i);
    expect(preview).not.toMatch(/@\/components\/admin|@\/lib\/admin/);
    expect(preview).not.toMatch(/supabase|useQuery|createServerFn|fetch\(/);
  });

  it("is wired into the hero card in place of the old static copy", () => {
    const hero = readFileSync("src/components/home/MarketplaceEntry.tsx", "utf8");
    expect(hero).toContain("<HeroAiPreview />");
    expect(hero).not.toContain("A neighbourhood storage marketplace.");
  });

  it("keeps the deleted simulated-AI demo deleted", () => {
    expect(() => readFileSync("src/components/home/SpaceFitDemo.tsx", "utf8")).toThrow();
  });
});

describe("hero preview auto-rotation rules", () => {
  it("rotates renter → host → renter", () => {
    expect(nextHeroExample("renter")).toBe("host");
    expect(nextHeroExample("host")).toBe("renter");
  });

  it("holds each example for about five seconds", () => {
    expect(HERO_ROTATION_MS).toBe(5000);
    expect(heroRotationDelay(false)).toBe(HERO_ROTATION_MS);
  });

  it("gives a manual selection a longer grace period before resuming", () => {
    expect(heroRotationDelay(true)).toBe(HERO_RESUME_AFTER_MANUAL_MS);
    expect(HERO_RESUME_AFTER_MANUAL_MS).toBeGreaterThan(HERO_ROTATION_MS);
  });

  it("keeps the transition restrained", () => {
    expect(HERO_TRANSITION_MS).toBeGreaterThanOrEqual(250);
    expect(HERO_TRANSITION_MS).toBeLessThanOrEqual(400);
  });

  it("pauses on hover, on a hidden tab, and for reduced-motion visitors", () => {
    const base = { hovered: false, documentHidden: false, reducedMotion: false };
    expect(shouldAutoRotate(base)).toBe(true);
    expect(shouldAutoRotate({ ...base, hovered: true })).toBe(false);
    expect(shouldAutoRotate({ ...base, documentHidden: true })).toBe(false);
    expect(shouldAutoRotate({ ...base, reducedMotion: true })).toBe(false);
  });
});

describe("hero preview rotation timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Mirrors the component effect without needing a DOM renderer. */
  function rotate(initial: HeroExampleId) {
    let active = initial;
    let manual = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        manual = false;
        active = nextHeroExample(active);
        schedule();
      }, heroRotationDelay(manual));
    };
    schedule();
    return {
      get active() {
        return active;
      },
      select(id: HeroExampleId) {
        manual = true;
        active = id;
        if (timer) clearTimeout(timer);
        schedule();
      },
      unmount() {
        if (timer) clearTimeout(timer);
        timer = undefined;
      },
      get running() {
        return timer !== undefined;
      },
    };
  }

  it("starts on renter and switches to host, then back", () => {
    vi.useFakeTimers();
    const r = rotate(HERO_DEFAULT_EXAMPLE);
    expect(r.active).toBe("renter");
    vi.advanceTimersByTime(HERO_ROTATION_MS);
    expect(r.active).toBe("host");
    vi.advanceTimersByTime(HERO_ROTATION_MS);
    expect(r.active).toBe("renter");
    r.unmount();
  });

  it("applies a manual selection immediately and restarts the timer", () => {
    vi.useFakeTimers();
    const r = rotate("renter");
    vi.advanceTimersByTime(3000);
    r.select("host");
    expect(r.active).toBe("host");
    // The original 5s tick would have fired here; the manual reset prevents it.
    vi.advanceTimersByTime(2000);
    expect(r.active).toBe("host");
    vi.advanceTimersByTime(HERO_RESUME_AFTER_MANUAL_MS);
    expect(r.active).toBe("renter");
    r.unmount();
  });

  it("supports manually returning to the renter example", () => {
    vi.useFakeTimers();
    const r = rotate("renter");
    vi.advanceTimersByTime(HERO_ROTATION_MS);
    expect(r.active).toBe("host");
    r.select("renter");
    expect(r.active).toBe("renter");
    r.unmount();
  });

  it("clears its timer on unmount", () => {
    vi.useFakeTimers();
    const r = rotate("renter");
    r.unmount();
    expect(r.running).toBe(false);
    vi.advanceTimersByTime(HERO_ROTATION_MS * 3);
    expect(r.active).toBe("renter");
  });
});

describe("hero preview accessibility", () => {
  it("respects prefers-reduced-motion", () => {
    expect(preview).toContain("usePrefersReducedMotion");
    expect(preview).toContain("motion-reduce:transition-none");
  });

  it("uses keyboard-accessible tab semantics with an exposed active state", () => {
    expect(preview).toContain('role="tablist"');
    expect(preview).toContain('role="tab"');
    expect(preview).toContain('role="tabpanel"');
    expect(preview).toContain("aria-selected=");
    expect(preview).toContain("aria-controls=");
    expect(preview).toContain("<button");
  });

  it("stacks both states in one grid cell so the page never jumps", () => {
    expect(preview).toContain("col-start-1 row-start-1");
  });

  it("pauses on hover and when the tab is hidden", () => {
    expect(preview).toContain("onMouseEnter");
    expect(preview).toContain("onMouseLeave");
    expect(preview).toContain("visibilitychange");
  });
});
