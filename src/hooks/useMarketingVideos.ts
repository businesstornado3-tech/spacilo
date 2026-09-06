/**
 * React Query wiring for video generation and platform connections.
 *
 * Every call is a server function that re-checks `is_platform_admin` in
 * Postgres before it reads or writes, so this hook is convenience only.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import {
  cancelCampaignVideo,
  disconnectPlatform,
  generateCampaignVideo,
  getCampaignVideos,
  getPublishingConnections,
  pollCampaignVideo,
  startPlatformConnection,
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
      mutationFn: (input: { assetId: string; tier: "draft" | "final" }) =>
        generate({ data: { campaignId: campaignId!, ...input } }),
      onSuccess: invalidate,
    }),
    poll: pollMutation,
  };
}

export function usePublishingConnections(enabled: boolean) {
  const queryClient = useQueryClient();
  const fetchConnections = useServerFn(getPublishingConnections);
  const start = useServerFn(startPlatformConnection);
  const disconnect = useServerFn(disconnectPlatform);
  const test = useServerFn(testPlatformConnection);
  const update = useServerFn(updatePlatformPublishing);

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
