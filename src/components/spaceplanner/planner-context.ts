/**
 * Planner context object and hook.
 *
 * Kept in a component-free module so React Fast Refresh never recreates the
 * context identity when the provider component file is edited — otherwise
 * consumers read a fresh, empty context and throw "must be rendered inside a
 * SpacePlannerProvider" during development hot updates.
 */
import * as React from "react";

import type {
  InventoryLine,
  PlannerCapabilities,
  EarnRoomScore,
  SpacePlan,
  StorageSpace,
} from "@/lib/spaceplanner";

export type PlannerPhase = "build" | "thinking" | "plan";

export interface PlannerContextValue {
  capabilities: PlannerCapabilities;
  quantities: Record<string, number>;
  lines: InventoryLine[];
  itemCount: number;
  itemTypeCount: number;
  rawVolume: number;
  /** True when a visitor has reached their catalogue-line allowance. */
  atItemLimit: boolean;
  space: StorageSpace;
  plan: SpacePlan | null;
  score: EarnRoomScore | null;
  phase: PlannerPhase;
  /** Set once a run has completed in this session — drives the unlock card. */
  hasCompletedRun: boolean;
  setQuantity: (itemId: string, quantity: number) => void;
  addOne: (itemId: string) => void;
  loadPreset: (lines: Array<{ itemId: string; quantity: number }>) => void;
  clear: () => void;
  setSpace: (space: StorageSpace) => void;
  setPhase: (phase: PlannerPhase) => void;
  run: () => void;
  completeRun: () => void;
}

export const PlannerContext = React.createContext<PlannerContextValue | null>(null);

export function useSpacePlanner(): PlannerContextValue {
  const context = React.useContext(PlannerContext);
  if (!context) {
    throw new Error("Planner components must be rendered inside a SpacePlannerProvider.");
  }
  return context;
}
