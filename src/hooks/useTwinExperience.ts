/**
 * Drives the signature Digital Twin experience.
 *
 * One clock, one engine, one source of truth. The hook advances real time,
 * asks the director which beat that lands on, and moves the engine cursor to
 * match. It never animates anything the planner did not decide.
 *
 * Pausing is deliberate and total: hover, keyboard focus, a hidden tab or an
 * off-screen section all stop the clock rather than letting it run invisibly.
 */
import * as React from "react";

import { buildPlan } from "@/lib/spaceplanner";
import type { InventoryLine, SpacePlan, StorageSpace } from "@/lib/spaceplanner/types";
import { DigitalTwinEngine, type TwinState } from "@/lib/twin/engine";
import {
  beatAt,
  buildExperience,
  liveMetrics,
  type ExperienceBeat,
  type LiveMetric,
  type TwinExperience,
} from "@/lib/twin/experience";
import { usePrefersReducedMotion } from "@/hooks/use-motion";

export interface UseTwinExperienceOptions {
  lines: InventoryLine[];
  space: StorageSpace;
  /** External pause (off-screen, hovered, focused, comparing). */
  paused?: boolean;
  /** Skip playback entirely and show the optimised layout. */
  staticFinal?: boolean;
}

export interface TwinExperienceApi {
  plan: SpacePlan;
  experience: TwinExperience;
  state: TwinState;
  beat: ExperienceBeat;
  /** 0–1 through the whole reasoning, from the engine cursor. */
  progress: number;
  metrics: LiveMetric[];
  playing: boolean;
  restart: () => void;
  /** Jump to the finished layout — used by the compare control. */
  showFinal: () => void;
  showOriginal: () => void;
}

export function useTwinExperience({
  lines,
  space,
  paused = false,
  staticFinal = false,
}: UseTwinExperienceOptions): TwinExperienceApi {
  const reduced = usePrefersReducedMotion();

  const plan = React.useMemo(() => buildPlan(lines, space), [lines, space]);
  const engine = React.useMemo(() => new DigitalTwinEngine(plan), [plan]);
  const experience = React.useMemo(
    () => buildExperience(plan, engine.getMotionPlan()),
    [plan, engine],
  );

  const [state, setState] = React.useState<TwinState>(() => engine.getState());
  const [beat, setBeat] = React.useState<ExperienceBeat>(() => experience.beats[0]!);
  const [override, setOverride] = React.useState<"none" | "original" | "final">("none");
  const elapsed = React.useRef(0);

  React.useEffect(() => engine.subscribe(setState), [engine]);

  // Reduced motion, or an explicit static request: show the outcome, no clock.
  const still = reduced || staticFinal;

  React.useEffect(() => {
    if (!still) return;
    engine.playToEnd();
    setBeat(experience.beats[experience.beats.length - 1]!);
  }, [still, engine, experience]);

  React.useEffect(() => {
    if (still || override !== "none") return;
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      if (!paused && !document.hidden) {
        elapsed.current = (elapsed.current + delta) % experience.loopMs;
        const next = beatAt(experience, elapsed.current);
        setBeat((current) => (current.id === next.id ? current : next));
        if (engine.getState().cursor !== next.cursor) engine.seek(next.cursor);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, experience, paused, still, override]);

  // A fresh plan (what-if) restarts the story from the top.
  React.useEffect(() => {
    elapsed.current = 0;
    setOverride("none");
    setBeat(experience.beats[0]!);
  }, [experience]);

  const restart = React.useCallback(() => {
    elapsed.current = 0;
    setOverride("none");
    engine.reset();
    setBeat(experience.beats[0]!);
  }, [engine, experience]);

  const showFinal = React.useCallback(() => {
    setOverride("final");
    engine.playToEnd();
    setBeat(experience.beats[experience.beats.length - 1]!);
  }, [engine, experience]);

  const showOriginal = React.useCallback(() => {
    setOverride("original");
    engine.reset();
    setBeat(experience.beats[0]!);
  }, [engine, experience]);

  const total = engine.getMotionPlan().steps.length;
  const progress = total === 0 ? 1 : state.cursor / total;

  return {
    plan,
    experience,
    state,
    beat,
    progress,
    metrics: React.useMemo(() => liveMetrics(plan, progress), [plan, progress]),
    playing: !still && !paused && override === "none",
    restart,
    showFinal,
    showOriginal,
  };
}
