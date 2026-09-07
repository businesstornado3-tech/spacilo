/**
 * Video worker registry — React Query wiring.
 *
 * The browser's own capability is probed on the device and sent with the
 * request, because only the browser can describe itself. Every call still
 * re-checks founder authorisation in the database.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import {
  createWorkerPairing,
  getVideoWorkers,
  getWorkerPairings,
  registerVideoWorker,
  removeVideoWorker,
  setVideoWorkerEnabled,
  updateVideoWorkerPreferences,
  type VideoWorkerSnapshot,
  type WorkerPairing,
} from "@/lib/marketing-workers.functions";
import { probeBrowser, type BrowserProbe } from "@/lib/marketing/workers";

export function useVideoWorkers(enabled: boolean) {
  const queryClient = useQueryClient();
  const fetchWorkers = useServerFn(getVideoWorkers);
  const register = useServerFn(registerVideoWorker);
  const remove = useServerFn(removeVideoWorker);
  const setEnabled = useServerFn(setVideoWorkerEnabled);
  const savePreferences = useServerFn(updateVideoWorkerPreferences);
  const fetchPairings = useServerFn(getWorkerPairings);
  const makePairing = useServerFn(createWorkerPairing);

  const [browser, setBrowser] = React.useState<BrowserProbe | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    void probeBrowser().then((probe) => {
      if (live) setBrowser(probe);
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  const query = useQuery<VideoWorkerSnapshot>({
    queryKey: ["marketing", "workers", browser ? "probed" : "pending"],
    queryFn: () => fetchWorkers({ data: { browser } }),
    enabled: enabled && browser !== null,
    // Heartbeats arrive continuously, so the list is kept reasonably fresh.
    refetchInterval: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["marketing", "workers"] });

  // Setup codes let a computer pair itself, so no secret is ever shown here.
  const pairings = useQuery<{ pairings: WorkerPairing[] }>({
    queryKey: ["marketing", "worker-pairings"],
    queryFn: () => fetchPairings({}),
    enabled,
  });

  return {
    query,
    browser,
    register: useMutation({
      mutationFn: (input: {
        mode: "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD";
        label: string;
        endpointUrl?: string | null;
        provider?: string | null;
      }) => register({ data: input }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (workerId: string) => remove({ data: { workerId } }),
      onSuccess: invalidate,
    }),
    setEnabled: useMutation({
      mutationFn: (input: { workerId: string; enabled: boolean }) => setEnabled({ data: input }),
      onSuccess: invalidate,
    }),
    pairings,
    createPairing: useMutation({
      mutationFn: (input: { label: string }) => makePairing({ data: input }),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["marketing", "worker-pairings"] });
        invalidate();
      },
    }),
    preferences: useMutation({
      mutationFn: (input: Parameters<typeof updateVideoWorkerPreferences>[0] extends never
        ? never
        : Record<string, unknown>) => savePreferences({ data: input as never }),
      onSuccess: invalidate,
    }),
  };
}
