/**
 * React Query wiring for video generation and platform connections.
 *
 * Every call is a server function that re-checks `is_platform_admin` in
 * Postgres before it reads or writes, so this hook is convenience only.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import type { CompositionReceipt } from "@/lib/marketing/branding/composition";
import {
  cancelCampaignVideo,
  disconnectPlatform,
  generateCampaignVideo,
  getCampaignVideos,
  getPublishingConnections,
  pollCampaignVideo,
  startPlatformConnection,
  storeAnimatedVideo,
  storeBrandedVideo,
  testPlatformConnection,
  updatePlatformPublishing,
  updateVideoProviderSettings,
  type MarketingVideoRow,
  type PublishingConnectionsSnapshot,
} from "@/lib/marketing-video.functions";

export const marketingVideoKeys = {
  videos: (campaignId: string) => ["marketing", "videos", campaignId] as const,
  connections: () => ["marketing", "connections"] as const,
};

export function useCampaignVideos(campaignId: string | null) {
  const queryClient = useQueryClient();
  const fetchVideos = useServerFn(getCampaignVideos);
  const generate = useServerFn(generateCampaignVideo);
  const poll = useServerFn(pollCampaignVideo);
  const cancel = useServerFn(cancelCampaignVideo);
  const storeAnimated = useServerFn(storeAnimatedVideo);
  const storeBranded = useServerFn(storeBrandedVideo);

  const query = useQuery<{ videos: MarketingVideoRow[] }>({
    queryKey: marketingVideoKeys.videos(campaignId ?? "none"),
    queryFn: () => fetchVideos({ data: { campaignId: campaignId! } }),
    enabled: Boolean(campaignId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: marketingVideoKeys.videos(campaignId ?? "none") });

  const pollMutation = useMutation({
    mutationFn: (videoId: string) => poll({ data: { videoId } }),
    onSuccess: invalidate,
  });
  const pollRef = React.useRef(pollMutation);
  pollRef.current = pollMutation;

  // Generation takes one to three minutes, so in-flight jobs are polled.
  const generating = (query.data?.videos ?? []).filter((video) => video.status === "GENERATING");
  const generatingIds = generating.map((video) => video.id).join(",");
  React.useEffect(() => {
    if (!generatingIds) return;
    const ids = generatingIds.split(",");
    const timer = window.setInterval(() => {
      for (const id of ids) pollRef.current.mutate(id);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [generatingIds]);

  return {
    query,
    generating,
    generate: useMutation({
      mutationFn: (input: {
        assetId: string;
        tier: "draft" | "final";
        confirmPaid?: boolean;
        /** Founder's worker choice for this generation. */
        worker?: "AUTO" | "BROWSER" | "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD";
        /** Which paid preset the founder chose, on the paid route only. */
        quality?: "STANDARD" | "HIGHEST";
        browser?: unknown;
      }) =>
        generate({
          data: { campaignId: campaignId!, confirmPaid: false, ...input },
        }),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: (videoId: string) => cancel({ data: { videoId } }),
      onSuccess: invalidate,
    }),
    poll: pollMutation,
    // The free animated route: the browser makes the file, the server only
    // checks and stores it.
    storeAnimated: useMutation({
      mutationFn: (input: {
        assetId: string;
        platform: string;
        aspect: "9:16" | "16:9" | "1:1";
        seconds: number;
        width: number;
        height: number;
        fps: number;
        digest: string;
        scenes: number;
        brandingNotes: string[];
        /** Deterministic quality verdict from the browser renderer. */
        qualityStatus:
          | "DRAFT"
          | "BROWSER_GENERATED"
          | "BRAND_VALIDATED"
          | "PRODUCTION_READY"
          | "VALIDATION_FAILED";
        qualityFailures: string[];
        mp4Base64: string;
      }) => storeAnimated({ data: { campaignId: campaignId!, ...input } }),
      onSuccess: invalidate,
    }),
    // The paid route returns unbranded pixels: the browser composes the
    // approved EarnRoom branding onto them and the server stores that file.
    storeBranded: useMutation({
      mutationFn: (input: {
        videoId: string;
        receipt: CompositionReceipt;
        mp4Base64: string;
      }) => storeBranded({ data: input }),
      onSuccess: invalidate,
    }),
  };
}

export function usePublishingConnections(enabled: boolean) {
  const queryClient = useQueryClient();
  const fetchConnections = useServerFn(getPublishingConnections);
  const start = useServerFn(startPlatformConnection);
  const disconnect = useServerFn(disconnectPlatform);
  const test = useServerFn(testPlatformConnection);
  const update = useServerFn(updatePlatformPublishing);
  const setVideoProvider = useServerFn(updateVideoProviderSettings);

  const query = useQuery<PublishingConnectionsSnapshot>({
    queryKey: marketingVideoKeys.connections(),
    queryFn: () => fetchConnections({}),
    enabled,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: marketingVideoKeys.connections() });

  return {
    query,
    start: useMutation({ mutationFn: (platform: string) => start({ data: { platform } }) }),
    test: useMutation({ mutationFn: (platform: string) => test({ data: { platform } }) }),
    disconnect: useMutation({
      mutationFn: (platform: string) => disconnect({ data: { platform } }),
      onSuccess: invalidate,
    }),
    videoProvider: useMutation({
      mutationFn: (input: {
        provider?: "SELF_HOSTED" | "PAID_HOSTED";
        paidProviderEnabled?: boolean;
      }) => setVideoProvider({ data: input }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: {
        platform: string;
        mode?: "DRAFT" | "APPROVAL_REQUIRED" | "AUTONOMOUS";
        paused?: boolean;
      }) => update({ data: input }),
      onSuccess: invalidate,
    }),
  };
}
