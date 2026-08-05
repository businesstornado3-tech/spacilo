import { createFileRoute } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { NotificationList } from "@/components/notifications/NotificationList";
import { useAuth } from "@/hooks/useAuth";

const description = "Updates about your bookings, messages and support cases.";
const title = "Notifications — " + brand.name;

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { mode } = useAuth();
  return (
    <AppLayout
      mode={mode}
      title="Notifications"
      description="What happened, and where to go next. Anything still waiting on you also stays in “Needs your attention” on your dashboard."
    >
      <NotificationList />
    </AppLayout>
  );
}
