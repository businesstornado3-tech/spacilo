/**
 * Founder Console — choose which YouTube channel EarnRoom publishes to.
 *
 * The Google account is connected once through the existing sign-in flow. This
 * panel asks YouTube which channels that account owns and stores the founder's
 * choice as the publishing destination. Shorts use the same channel, so there
 * is deliberately no second connection to make.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Alert } from "@/components/common/Alert";
import {
  getYoutubeDestination,
  listYoutubeChannels,
  selectYoutubeChannel,
} from "@/lib/youtube.functions";
import { cn } from "@/lib/utils";

export function YoutubeDestinationCard({ connected }: { connected: boolean }) {
  const client = useQueryClient();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  const destination = useQuery({
    queryKey: ["youtube-destination"],
    queryFn: () => getYoutubeDestination(),
    enabled: connected,
  });

  const channels = useMutation({
    mutationFn: () => listYoutubeChannels(),
    onSuccess: (result) => {
      setProblem(result.ok ? null : result.detail);
      setNotice(result.ok ? null : null);
    },
    onError: (error: Error) => setProblem(error.message),
  });

  const choose = useMutation({
    mutationFn: (channelId: string) => selectYoutubeChannel({ data: { channelId } }),
    onSuccess: async (result) => {
      setProblem(result.ok ? null : result.detail);
      setNotice(result.ok ? result.detail : null);
      await client.invalidateQueries({ queryKey: ["youtube-destination"] });
      await client.invalidateQueries({ queryKey: ["publishing-connections"] });
      await client.invalidateQueries({ queryKey: ["acquisition-status"] });
    },
    onError: (error: Error) => setProblem(error.message),
  });

  if (!connected) return null;

  const state = destination.data;
  const found = channels.data?.channels ?? [];

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      <p className="type-body-xs text-muted-foreground">
        {state?.channelId
          ? `Destination channel: ${state.channelLabel ?? state.channelId}. Shorts publish to this same channel.`
          : "Choose the channel EarnRoom should publish to. Shorts will use the same channel."}
      </p>

      <button
        type="button"
        onClick={() => channels.mutate()}
        disabled={channels.isPending}
        className="min-h-9 rounded-lg border border-border px-2 type-body-xs hover:bg-secondary disabled:opacity-60"
      >
        {channels.isPending
          ? "Checking with YouTube…"
          : state?.channelId
            ? "Change channel"
            : "Choose channel"}
      </button>

      {found.length > 0 ? (
        <ul className="space-y-1">
          {found.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                onClick={() => choose.mutate(channel.id)}
                disabled={choose.isPending}
                className={cn(
                  "min-h-9 w-full rounded-lg border px-2 text-left type-body-xs disabled:opacity-60",
                  state?.channelId === channel.id
                    ? "border-primary bg-primary-soft text-primary-soft-foreground"
                    : "border-border hover:bg-secondary",
                )}
              >
                {channel.title}
                {channel.handle ? ` (${channel.handle})` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <Alert tone="success" title="Destination saved">
          {notice}
        </Alert>
      ) : null}
      {problem ? (
        <Alert tone="warning" title="Could not read your channels">
          {problem}
        </Alert>
      ) : null}
    </div>
  );
}
