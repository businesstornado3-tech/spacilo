/**
 * SpaciloAIContext — one shared AI state for the whole product.
 *
 * Any surface (planner, listing, host review, homepage) reads the same status,
 * confidence, recommendations and errors from here. Components never call a
 * provider directly and never learn which vendor is behind it: they ask this
 * context to run a stage and render whatever comes back.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  CompatibilityResult,
  DetectedInventory,
  DetectedSpace,
  InventoryLine,
  IntelligenceCapability,
  PackingResult,
  Recommendation,
  StorageSpace,
  VisionPhoto,
} from "./contracts";
import type { OverallConfidence } from "./confidence";
import { IntelligenceError, toIntelligenceError } from "./errors";
import { overallStatus, providerHealth, type IntelligenceStatus, type ProviderHealth } from "./health";
import {
  analyseBelongings,
  analyseSpace,
  assessCompatibility,
  packInventory,
  recommendFor,
  runPipeline,
  type PipelineResult,
  type PipelineStageId,
} from "./pipeline";
import { activeProviders, platformCapabilities, supports } from "./registry";
import { PROVIDER_SLOTS } from "./providers";

export interface SpaciloAIState {
  status: IntelligenceStatus;
  /** The stage currently running, when one is. */
  stage: PipelineStageId | null;
  inventory: DetectedInventory | null;
  space: DetectedSpace | null;
  packing: PackingResult | null;
  recommendations: Recommendation[];
  compatibility: CompatibilityResult | null;
  confidence: OverallConfidence | null;
  error: IntelligenceError | null;
  fallback: string | null;
}

export interface SpaciloAIContextValue extends SpaciloAIState {
  capabilities: IntelligenceCapability[];
  supports: (capability: IntelligenceCapability) => boolean;
  health: ProviderHealth[];
  /** Run a single stage. Each cancels any run already in flight. */
  scanBelongings: (photos: VisionPhoto[]) => Promise<DetectedInventory | null>;
  scanSpace: (photos: VisionPhoto[], spaceType?: string) => Promise<DetectedSpace | null>;
  plan: (lines: InventoryLine[], space: StorageSpace) => Promise<PackingResult | null>;
  analyseBooking: (result: PackingResult) => Promise<CompatibilityResult | null>;
  /** Vision → packing → recommendations → compatibility in one call. */
  run: (input: {
    photos?: VisionPhoto[];
    lines: InventoryLine[];
    space: StorageSpace;
  }) => Promise<PipelineResult | null>;
  cancel: () => void;
  reset: () => void;
}

const EMPTY: SpaciloAIState = {
  status: "ready",
  stage: null,
  inventory: null,
  space: null,
  packing: null,
  recommendations: [],
  compatibility: null,
  confidence: null,
  error: null,
  fallback: null,
};

const SpaciloAIContext = createContext<SpaciloAIContextValue | null>(null);

export function SpaciloAIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SpaciloAIState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mounted.current) setState((prev) => ({ ...prev, status: "ready", stage: null }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mounted.current) setState(EMPTY);
  }, []);

  /** Shared wrapper: cancellation, status, and one consistent error shape. */
  const guard = useCallback(
    async <T,>(
      stage: PipelineStageId,
      work: (signal: AbortSignal) => Promise<T>,
      apply: (result: T) => Partial<SpaciloAIState>,
    ): Promise<T | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((prev) => ({ ...prev, status: "processing", stage, error: null, fallback: null }));

      try {
        const result = await work(controller.signal);
        if (!mounted.current || controller.signal.aborted) return null;
        setState((prev) => ({ ...prev, ...apply(result), status: "ready", stage: null }));
        return result;
      } catch (cause) {
        if (!mounted.current || controller.signal.aborted) return null;
        const error = toIntelligenceError(cause);
        setState((prev) => ({
          ...prev,
          status: error.code === "cancelled" ? "ready" : "degraded",
          stage: null,
          error,
          fallback: error.fallback,
        }));
        return null;
      }
    },
    [],
  );

  const scanBelongings = useCallback(
    (photos: VisionPhoto[]) =>
      guard(
        "vision",
        (signal) => analyseBelongings(photos, signal),
        (inventory) => ({ inventory }),
      ),
    [guard],
  );

  const scanSpace = useCallback(
    (photos: VisionPhoto[], spaceType?: string) =>
      guard(
        "dimensions",
        (signal) => analyseSpace(photos, spaceType, signal),
        (space) => ({ space }),
      ),
    [guard],
  );

  const plan = useCallback(
    (lines: InventoryLine[], space: StorageSpace) =>
      guard(
        "packing",
        async (signal) => {
          const packing = await packInventory(lines, space, signal);
          const recommendations = await recommendFor(packing, signal);
          return { packing, recommendations };
        },
        ({ packing, recommendations }) => ({ packing, recommendations }),
      ).then((result) => result?.packing ?? null),
    [guard],
  );

  const analyseBooking = useCallback(
    (result: PackingResult) =>
      guard(
        "compatibility",
        (signal) => assessCompatibility(result, signal),
        (compatibility) => ({ compatibility, recommendations: compatibility.recommendations }),
      ),
    [guard],
  );

  const run = useCallback(
    (input: { photos?: VisionPhoto[]; lines: InventoryLine[]; space: StorageSpace }) =>
      guard(
        "vision",
        (signal) => runPipeline({ ...input, signal }),
        (result) => ({
          inventory: result.inventory,
          packing: result.packing,
          recommendations: result.recommendations,
          compatibility: result.compatibility,
          confidence: result.confidence,
        }),
      ),
    [guard],
  );

  const value = useMemo<SpaciloAIContextValue>(() => {
    const providers = activeProviders();
    const health = PROVIDER_SLOTS.map((slot) => providerHealth(slot, providers[slot].id));
    return {
      ...state,
      status: state.status === "processing" ? "processing" : overallStatus(health),
      capabilities: platformCapabilities(),
      supports,
      health,
      scanBelongings,
      scanSpace,
      plan,
      analyseBooking,
      run,
      cancel,
      reset,
    };
  }, [state, scanBelongings, scanSpace, plan, analyseBooking, run, cancel, reset]);

  return <SpaciloAIContext.Provider value={value}>{children}</SpaciloAIContext.Provider>;
}

export function useIntelligence(): SpaciloAIContextValue {
  const value = useContext(SpaciloAIContext);
  if (!value) throw new Error("useIntelligence must be used inside <SpaciloAIProvider>.");
  return value;
}

/** Safe outside a provider — surfaces that only optionally use AI. */
export function useOptionalIntelligence(): SpaciloAIContextValue | null {
  return useContext(SpaciloAIContext);
}
