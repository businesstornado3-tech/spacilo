/**
 * Where a post actually goes on LinkedIn, TikTok and Pinterest.
 *
 * These three platforms need one more real choice after signing in: which
 * board to pin to, who to post as, or how visible TikTok will let a post be.
 * Everything shown here is read from the platform itself — nothing is guessed,
 * and nothing is chosen for the founder.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import {
  getPlatformDestinations,
  selectPlatformDestination,
  type DestinationSnapshot,
} from "@/lib/social-destinations.functions";

export type DestinationPlatform = "linkedin" | "tiktok" | "pinterest";

const HEADING: Record<DestinationPlatform, string> = {
  linkedin: "Post as",
  tiktok: "Who can see the post",
  pinterest: "Board to pin to",
};

export function PlatformDestination({ platform }: { platform: DestinationPlatform }) {
  const queryClient = useQueryClient();
  const fetchDestinations = useServerFn(getPlatformDestinations);
  const choose = useServerFn(selectPlatformDestination);
  const [notice, setNotice] = React.useState<string | null>(null);

  const key = ["marketing", "destinations", platform] as const;
  const query = useQuery<DestinationSnapshot>({
    queryKey: key,
    queryFn: () => fetchDestinations({ data: { platform } }),
  });

  const save = useMutation({
    mutationFn: (option: { id: string; label: string }) =>
      choose({ data: { platform, destinationId: option.id, destinationLabel: option.label } }),
    onSuccess: (result) => {
      setNotice(result.detail);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["marketing", "publishing"] });
    },
  });

  const data = query.data;
  if (query.isLoading) {
    return <p className="mt-3 type-body-xs text-muted-foreground">Checking {HEADING[platform]}…</p>;
  }
  if (!data || !data.connected) return null;

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="type-body-xs font-semibold">{HEADING[platform]}</p>
      {data.account ? (
        <p className="mt-1 type-body-xs text-muted-foreground">Signed in as {data.account}.</p>
      ) : null}
      {data.selectedLabel ? (
        <p className="mt-1 type-body-xs text-muted-foreground">Chosen: {data.selectedLabel}.</p>
      ) : null}
      {data.options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {data.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate({ id: option.id, label: option.label })}
              className={
                option.id === data.selectedId
                  ? "min-h-9 rounded-lg border border-primary bg-secondary px-3 type-body-xs font-medium"
                  : "min-h-9 rounded-lg border border-border px-3 type-body-xs hover:bg-secondary"
              }
            >
              {option.label}
              {option.detail ? (
                <span className="ml-1 text-muted-foreground">· {option.detail}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {data.detail ? (
        <p className="mt-2 type-body-xs text-muted-foreground">{data.detail}</p>
      ) : null}
      {notice ? <p className="mt-1 type-body-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}
