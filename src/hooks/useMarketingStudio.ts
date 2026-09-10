/**
 * React Query wiring for the founder marketing studio.
 *
 * Every call is a server function that re-checks `is_platform_admin` in
 * Postgres before it reads or writes, so this hook is convenience only.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  decideMarketingCampaign,
  getMarketingStudio,
  planMarketingCampaign,
  publishMarketingCampaign,
  runAutonomousPublishing,
  updateMarketingSettings,
  type MarketingStudioSnapshot,
} from "@/lib/marketing.functions";

export const marketingKeys = {
  studio: () => ["marketing", "studio"] as const,
};

export function useMarketingStudio(enabled: boolean) {
  const queryClient = useQueryClient();
  const fetchStudio = useServerFn(getMarketingStudio);
  const plan = useServerFn(planMarketingCampaign);
  const decide = useServerFn(decideMarketingCampaign);
  const publish = useServerFn(publishMarketingCampaign);
  const saveSettings = useServerFn(updateMarketingSettings);
  const runAutonomous = useServerFn(runAutonomousPublishing);

  const query = useQuery<MarketingStudioSnapshot>({
    queryKey: marketingKeys.studio(),
    queryFn: () => fetchStudio({}),
    enabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: marketingKeys.studio() });

  return {
    query,
    generate: useMutation({
      mutationFn: (input: { forceOpportunityKey?: string } = {}) => plan({ data: input }),
      onSuccess: invalidate,
    }),
    decide: useMutation({
      mutationFn: (input: { campaignId: string; decision: "APPROVE" | "REJECT"; note?: string | undefined }) =>
        decide({ data: input }),
      onSuccess: invalidate,
    }),
    publish: useMutation({
      mutationFn: (input: { campaignId: string }) => publish({ data: input }),
      onSuccess: invalidate,
    }),
    settings: useMutation({
      mutationFn: (input: {
        globalMode?: "DRAFT" | "APPROVAL_REQUIRED" | "AUTONOMOUS";
        pauseAllPublishing?: boolean;
        maxDailyAutonomousPublications?: number;
        autoApprove?: boolean;
        pausedPlatforms?: string[];
      }) => saveSettings({ data: input }),
      onSuccess: invalidate,
    }),
    /** One autonomous cycle: auto-approve where allowed, then publish. */
    autonomous: useMutation({
      mutationFn: () => runAutonomous({}),
      onSuccess: invalidate,
    }),
  };
}
