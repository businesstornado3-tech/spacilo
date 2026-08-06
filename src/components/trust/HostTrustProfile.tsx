/**
 * Public host trust profile (Prompt 26B, Phase 3).
 *
 * Facts and checks, never promises: a verified phone number is a check that
 * was completed, a reply rate is a measurement over 90 days. Nothing here
 * claims a host is safe or guaranteed.
 */
import { BadgeCheck, CalendarDays, Home, MessageSquare, Star, Timer } from "lucide-react";

import { hostProfileView, type HostProfilePayload } from "@/lib/trust/host-profile";

function Fact({ icon: Icon, children }: { icon: typeof Star; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 type-body-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="text-foreground">{children}</span>
    </li>
  );
}

export function HostTrustProfile({
  profile,
  isLoading = false,
}: {
  profile: HostProfilePayload | null | undefined;
  isLoading?: boolean;
}) {
  const view = hostProfileView(profile);

  return (
    <section
      aria-labelledby="host-profile-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <h2 id="host-profile-heading" className="type-h3">
        Your host, {view.firstName}
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        First names only. Full contact details are shared on the booking, not before.
      </p>

      {isLoading ? (
        <p className="mt-4 type-body-sm text-muted-foreground">Loading host details…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {view.ratingLabel ? (
            <Fact icon={Star}>
              {view.ratingLabel} out of 5 · {view.reviewsLabel}
            </Fact>
          ) : (
            <Fact icon={Star}>{view.reviewsLabel}</Fact>
          )}
          <Fact icon={Home}>{view.listingsLabel}</Fact>
          <Fact icon={MessageSquare}>{view.completedLabel}</Fact>
          {view.responseRateLabel ? (
            <Fact icon={MessageSquare}>{view.responseRateLabel}</Fact>
          ) : null}
          {view.responseTimeLabel ? <Fact icon={Timer}>{view.responseTimeLabel}</Fact> : null}
          {view.joinedLabel ? <Fact icon={CalendarDays}>Hosting since {view.joinedLabel}</Fact> : null}
          {view.phoneVerified ? <Fact icon={BadgeCheck}>Phone number verified</Fact> : null}
        </ul>
      )}
    </section>
  );
}
