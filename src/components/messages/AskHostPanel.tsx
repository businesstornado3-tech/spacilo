/**
 * "Ask the host" on a public listing (Prompt 23E).
 *
 * A question is not a commitment: opening this thread reserves nothing,
 * charges nothing and tells the host nothing beyond what you write. Once a
 * booking exists the conversation moves to the booking thread.
 */
import { track } from "@/lib/analytics/tracker";
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSpaceConversation } from "@/hooks/useMessages";
import { MessageThread } from "@/components/messages/MessageThread";

export function AskHostPanel({ spaceId, spaceTitle }: { spaceId: string; spaceTitle?: string }) {
  const { user } = useAuth();
  const { data: conversation, isLoading, error } = useSpaceConversation(spaceId, Boolean(user));
  const started = React.useRef(false);

  // One "started" per listing view, the moment a real thread is available.
  React.useEffect(() => {
    if (!user || !conversation || started.current) return;
    started.current = true;
    track("enquiry_started", { props: { space_id: spaceId } });
  }, [user, conversation, spaceId]);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <MessageSquare className="mt-0.5 size-5 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="type-h3">Ask the host</h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Questions about access, timings or what fits. Asking doesn&apos;t reserve the space and
            nothing is charged.
          </p>

          {!user ? (
            <Button asChild size="sm" className="mt-3">
              <Link to="/login" search={{ redirect: `/spaces/${spaceId}` }}>
                Sign in to ask
              </Link>
            </Button>
          ) : error ? (
            <p className="mt-3 type-body-sm text-muted-foreground">
              You can&apos;t message this listing. Hosts can&apos;t enquire about their own space.
            </p>
          ) : (
            <div className="mt-4">
              <MessageThread
                conversation={conversation}
                viewerId={user.id}
                audience="renter"
                isLoading={isLoading}
                onSent={() => track("enquiry_sent", { props: { space_id: spaceId } })}
                emptyHint={`No messages yet. Ask about ${spaceTitle ? `“${spaceTitle}”` : "this space"} before you send a request.`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
