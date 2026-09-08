/**
 * Founder-only Google OAuth verification demonstration route.
 *
 * Not linked from public navigation and excluded from search engines. Access is
 * the signed-in gate plus `is_platform_admin(auth.uid())` re-checked inside
 * every server function this page calls.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AdminShell, AdminSectionBlock } from "@/components/admin/AdminShell";
import { YoutubeVerificationDemo } from "@/components/admin/YoutubeVerificationDemo";

export const Route = createFileRoute("/_authenticated/admin/youtube-verification-demo")({
  component: YoutubeVerificationDemoRoute,
  head: () => ({
    meta: [
      { title: "YouTube OAuth Verification Demo · EarnRoom" },
      {
        name: "description",
        content:
          "Internal EarnRoom founder tool for running and recording the real YouTube OAuth verification demonstration.",
      },
      { property: "og:title", content: "YouTube OAuth Verification Demo · EarnRoom" },
      { property: "og:description", content: "Internal EarnRoom founder verification tool." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function YoutubeVerificationDemoRoute() {
  return (
    <AdminShell
      title="YouTube OAuth Verification Demo"
      description="Run the real Google authorisation, channel read and video upload, and record the whole thing for Google's verification review."
    >
      <AdminSectionBlock
        id="youtube-verification-demo"
        title="Verification demonstration"
        note="Real Google screens, real YouTube API calls, real EarnRoom marketing video. Nothing on this page is simulated."
      >
        <YoutubeVerificationDemo />
      </AdminSectionBlock>
    </AdminShell>
  );
}
