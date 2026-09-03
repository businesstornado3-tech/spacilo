/**
 * SpacePlannerProvider — the single source of planner state.
 *
 * Every planner surface in EarnRoom (homepage demo, renter dashboard, listing
 * "will it fit?", host booking review) mounts this provider and renders the
 * shared panels beneath it. The deterministic engine in `@/lib/spaceplanner`
 * does the thinking; this context only holds intent, capability and phase, so
 * a future engine (vision, 3D, server optimisation) drops straight in.
 */
import * as React from "react";

import { track } from "@/lib/analytics/tracker";

import {
  CATALOGUE_BY_ID,
  SPACE_BY_ID,
  capabilitiesFor,
  itemVolume,
  simulationEngine,
  earnroomScore,
  type InventoryLine,
  type PlannerMode,
  type EarnRoomScore,
  type SpacePlan,
  type SpacePlannerEngine,
  type StorageSpace,
} from "@/lib/spaceplanner";

import {
  PlannerContext,
  useSpacePlanner,
  type PlannerContextValue,
  type PlannerPhase,
} from "@/components/spaceplanner/planner-context";

export { useSpacePlanner };
export type { PlannerContextValue, PlannerPhase };


export interface SpacePlannerProviderProps {
  mode: PlannerMode;
  children: React.ReactNode;
  initialSpace?: StorageSpace;
  initialQuantities?: Record<string, number>;
  /** Swappable planning engine — defaults to the deterministic simulation. */
  engine?: SpacePlannerEngine;
  onRunComplete?: (plan: SpacePlan, score: EarnRoomScore) => void;
}

const FALLBACK_SPACE = SPACE_BY_ID.get("garage")!;

export function SpacePlannerProvider({
  mode,
  children,
  initialSpace,
  initialQuantities,
  engine = simulationEngine,
  onRunComplete,
}: SpacePlannerProviderProps) {
  const capabilities = React.useMemo(() => capabilitiesFor(mode), [mode]);
  const [quantities, setQuantities] = React.useState<Record<string, number>>(
    initialQuantities ?? {},
  );
  const [space, setSpace] = React.useState<StorageSpace>(initialSpace ?? FALLBACK_SPACE);
  const [phase, setPhase] = React.useState<PlannerPhase>("build");
  const [hasCompletedRun, setHasCompletedRun] = React.useState(false);

  /** Capability gate: trims an inventory to the allowance for this mode. */
  const limit = React.useCallback(
    (next: Record<string, number>) => {
      const active = Object.entries(next).filter(([, quantity]) => quantity > 0);
      if (active.length <= capabilities.maxItemTypes) return next;
      return Object.fromEntries(active.slice(0, capabilities.maxItemTypes));
    },
    [capabilities.maxItemTypes],
  );

  const lines: InventoryLine[] = React.useMemo(
    () =>
      Object.entries(quantities)
        .map(([itemId, quantity]) => ({ item: CATALOGUE_BY_ID.get(itemId)!, quantity }))
        .filter((line) => line.item && line.quantity > 0),
    [quantities],
  );

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const rawVolume = lines.reduce((sum, line) => sum + itemVolume(line.item) * line.quantity, 0);

  const plan = React.useMemo(
    () => (itemCount > 0 ? engine.plan(lines, space) : null),
    [engine, lines, space, itemCount],
  );
  const score = React.useMemo(() => (plan ? earnroomScore(plan) : null), [plan]);

  const setQuantity = React.useCallback(
    (itemId: string, quantity: number) => {
      setQuantities((current) => {
        const next = { ...current, [itemId]: Math.max(0, quantity) };
        if (quantity > 0 && !(current[itemId] ?? 0)) return limit(next);
        return next;
      });
    },
    [limit],
  );

  const addOne = React.useCallback(
    (itemId: string) => {
      setQuantities((current) => {
        const next = { ...current, [itemId]: (current[itemId] ?? 0) + 1 };
        return (current[itemId] ?? 0) > 0 ? next : limit(next);
      });
    },
    [limit],
  );

  const loadPreset = React.useCallback(
    (presetLines: Array<{ itemId: string; quantity: number }>) => {
      setQuantities(limit(Object.fromEntries(presetLines.map((l) => [l.itemId, l.quantity]))));
      setPhase("build");
    },
    [limit],
  );

  const clear = React.useCallback(() => {
    setQuantities({});
    setPhase("build");
  }, []);

  const run = React.useCallback(() => {
    setPhase("thinking");
    track("planner_started", { props: { items: lines.length } });
  }, [lines.length]);

  const completeRun = React.useCallback(() => {
    setPhase("plan");
    setHasCompletedRun(true);
    track("planner_completed", {
      props: { items: lines.length, fit: score ? Math.round(score.value) : 0 },
    });
    if (plan && score) onRunComplete?.(plan, score);
  }, [plan, score, onRunComplete, lines.length]);

  const itemTypeCount = lines.length;

  const value = React.useMemo<PlannerContextValue>(
    () => ({
      capabilities,
      quantities,
      lines,
      itemCount,
      itemTypeCount,
      rawVolume,
      atItemLimit: itemTypeCount >= capabilities.maxItemTypes,
      space,
      plan,
      score,
      phase,
      hasCompletedRun,
      setQuantity,
      addOne,
      loadPreset,
      clear,
      setSpace,
      setPhase,
      run,
      completeRun,
    }),
    [
      capabilities,
      quantities,
      lines,
      itemCount,
      itemTypeCount,
      rawVolume,
      space,
      plan,
      score,
      phase,
      hasCompletedRun,
      setQuantity,
      addOne,
      loadPreset,
      clear,
      run,
      completeRun,
    ],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}
