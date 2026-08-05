/**
 * Founder/admin operations dashboard (Prompt 23C, Part D-F).
 *
 * SECURITY: `useIsPlatformAdmin` below is a UX convenience only. The real
 * boundary is server-side — the three RPCs this page calls
 * (`admin_dashboard_kpis`, `admin_dashboard_trends`, `admin_dashboard_breakdowns`)
 * are SECURITY DEFINER functions that re-check `is_platform_admin(auth.uid())`
 * in Postgres and raise `not_authorized` for anyone else, so a renter/host
 * typing this URL, or tampering with client state, gains nothing.
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { NativeSelect } from "@/components/form/Field";
import { useIsPlatformAdmin, useAdminKpis, useAdminTrends, useAdminBreakdowns } from "@/hooks/useAdminDashboard";
import { UNIQUE_VISITOR_DEFINITION } from "@/lib/analytics/tracker";
import {
  type DateRangeKey,
  DATE_RANGE_LABEL,
  resolveDateRange,
  previousEquivalentRange,
  formatDelta,
  deltaLabel,
  formatPence,
  formatCount,
  buildFunnel,
  buildCsvReport,
  toCsv,
} from "@/lib/admin/dashboard";

const title = "Founder dashboard — " + brand.name;
const description = "Internal operational overview of traffic, accounts, marketplace activity and finances.";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminDashboardRoute,
});

function num(json: unknown, path: string): number {
  if (!json || typeof json !== "object") return 0;
  const value = (json as Record<string, unknown>)[path];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta: ReturnType<typeof formatDelta> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="type-body-xs text-muted-foreground">{label}</p>
      <p className="mt-1 type-h3">{value}</p>
      <p className="mt-1 type-body-xs text-muted-foreground">{deltaLabel(delta)}</p>
    </div>
  );
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminDashboardRoute() {
  const admin = useIsPlatformAdmin();
  const [rangeKey, setRangeKey] = React.useState<DateRangeKey>("30d");
  const range = React.useMemo(() => resolveDateRange(rangeKey), [rangeKey]);
  const previous = React.useMemo(() => previousEquivalentRange(range), [range]);

  const enabled = admin.data === true;
  const kpis = useAdminKpis(range, previous, enabled);
  const trends = useAdminTrends(range, enabled);
  const breakdowns = useAdminBreakdowns(range, enabled);

  if (admin.isLoading) {
    return (
      <AppLayout mode="renter" title="Founder dashboard">
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </AppLayout>
    );
  }

  if (!admin.data) {
    return (
      <AppLayout mode="renter" title="Founder dashboard">
        <EmptyState
          title="You don't have access to this area"
          description="The founder dashboard is only available to Spacilo platform admins."
        />
      </AppLayout>
    );
  }

  const current = kpis.data?.current;
  const prior = kpis.data?.previous;
  const eventCounts = (breakdowns.data && typeof breakdowns.data === "object"
    ? (breakdowns.data as Record<string, unknown>)["event_counts"]
    : {}) as Record<string, number> | undefined;
  const attention = (breakdowns.data && typeof breakdowns.data === "object"
    ? (breakdowns.data as Record<string, unknown>)["attention"]
    : {}) as Record<string, number> | undefined;
  const topPages = (breakdowns.data && typeof breakdowns.data === "object"
    ? (breakdowns.data as Record<string, unknown>)["top_pages"]
    : []) as Array<{ path: string; page_views: number; visitors: number }> | undefined;

  const trendRows = Array.isArray((trends.data as Record<string, unknown> | undefined)?.["series"])
    ? ((trends.data as Record<string, unknown>)["series"] as Array<Record<string, unknown>>)
    : [];

  const kpiDefs: Array<{ key: string; label: string }> = [
    { key: "unique_visitors", label: "Unique visitors" },
    { key: "new_accounts", label: "New accounts" },
    { key: "spaces_published", label: "Published spaces (period)" },
    { key: "storage_requests", label: "Storage requests" },
    { key: "bookings", label: "Bookings" },
    { key: "gbv_booked_pence", label: "Gross booking value (booked)" },
    { key: "fees_booked_pence", label: "Spacilo fees (booked)" },
  ];
  const publishedSpacesNow = num(current, "published_spaces_now");

  const funnel = buildFunnel([
    { key: "visitor", label: "Visitor", value: num(current, "unique_visitors"), attributable: true },
    { key: "account", label: "Account", value: num(current, "new_accounts"), attributable: false },
    { key: "storage_request", label: "Storage request", value: num(current, "storage_requests"), attributable: false },
    { key: "booking", label: "Booking", value: num(current, "bookings"), attributable: false },
  ]);

  const financial = [
    { label: "Gross booking value — BOOKED", value: formatPence(num(current, "gbv_booked_pence")) },
    { label: "Gross value — PAID", value: formatPence(num(current, "gbv_paid_pence")) },
    { label: "Spacilo fees — booked", value: formatPence(num(current, "fees_booked_pence")) },
    { label: "Spacilo fees — paid", value: formatPence(num(current, "fees_paid_pence")) },
    { label: "Host amount — booked", value: formatPence(num(current, "host_amount_booked_pence")) },
    { label: "Host amount — paid", value: formatPence(num(current, "host_amount_paid_pence")) },
    { label: "Refunds", value: formatPence(num(current, "refunds_pence")) },
    { label: "Refunded fees", value: formatPence(num(current, "refunded_fees_pence")) },
    { label: "Net Spacilo fees after refunds", value: formatPence(num(current, "net_fees_pence")) },
    { label: "Refund count", value: formatCount(num(current, "refund_count")) },
    { label: "Disputed count", value: formatCount(num(current, "disputed_count")) },
    { label: "Failed payments", value: formatCount(num(current, "failed_payment_count")) },
  ];

  const attentionItems = [
    { label: "Open disputes", value: attention?.["open_disputes"] ?? 0 },
    { label: "Failed payments", value: attention?.["failed_payments"] ?? 0 },
    { label: "Draft spaces", value: attention?.["draft_spaces"] ?? 0 },
    { label: "Expiring requests", value: attention?.["expiring_requests"] ?? 0 },
  ];
  const hasAttention = attentionItems.some((a) => Number(a.value) > 0);

  const exportFinancial = () =>
    downloadCsv(
      buildCsvReport("financial-summary", range, ["Metric", "Value"], financial.map((f) => [f.label, f.value])).filename,
      buildCsvReport("financial-summary", range, ["Metric", "Value"], financial.map((f) => [f.label, f.value])).rows,
    );
  const exportMarketplace = () => {
    const rows = kpiDefs.map((d) => [d.label, num(current, d.key)]);
    const report = buildCsvReport("marketplace-summary", range, ["Metric", "Value"], rows);
    downloadCsv(report.filename, report.rows);
  };
  const exportTraffic = () => {
    const rows: (string | number | null)[][] = [
      ["Unique visitors", num(current, "unique_visitors")],
      ["Sessions", num(current, "sessions")],
      ["Page views", num(current, "page_views")],
    ];
    const report = buildCsvReport("traffic-summary", range, ["Metric", "Value"], rows);
    downloadCsv(report.filename, report.rows);
  };

  const anyError = kpis.isError || trends.isError || breakdowns.isError;

  return (
    <AppLayout mode="renter" title="Founder dashboard" description={description}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="type-label" htmlFor="admin-range">
          Date range
        </label>
        <NativeSelect id="admin-range" value={rangeKey} onChange={(e) => setRangeKey(e.target.value as DateRangeKey)}>
          {(Object.keys(DATE_RANGE_LABEL) as DateRangeKey[])
            .filter((k) => k !== "custom")
            .map((k) => (
              <option key={k} value={k}>
                {DATE_RANGE_LABEL[k]}
              </option>
            ))}
        </NativeSelect>
      </div>

      {anyError ? (
        <ErrorState
          title="We couldn't load the dashboard"
          description="One or more figures failed to load. This is shown as unavailable, never as zero."
        />
      ) : null}

      {/* §29 KPI strip */}
      <section aria-labelledby="kpi-heading" className="mt-4">
        <h2 id="kpi-heading" className="type-h3">
          Overview — {DATE_RANGE_LABEL[rangeKey]}
        </h2>
        <p className="mt-1 type-body-xs text-muted-foreground">
          Published spaces right now: {formatCount(publishedSpacesNow)} (live figure, not tied to the date range).
        </p>
        {kpis.isLoading ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiDefs.map((def) => (
              <KpiCard
                key={def.key}
                label={def.label}
                value={def.key.endsWith("_pence") ? formatPence(num(current, def.key)) : formatCount(num(current, def.key))}
                delta={formatDelta(current ? num(current, def.key) : null, prior ? num(prior, def.key) : null)}
              />
            ))}
          </div>
        )}
      </section>

      {/* §31-33 traffic */}
      <section aria-labelledby="traffic-heading" className="mt-8">
        <h2 id="traffic-heading" className="type-h3">
          Traffic
        </h2>
        <p className="mt-1 type-body-xs text-muted-foreground">{UNIQUE_VISITOR_DEFINITION}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Unique visitors"
            value={formatCount(num(current, "unique_visitors"))}
            delta={formatDelta(current ? num(current, "unique_visitors") : null, prior ? num(prior, "unique_visitors") : null)}
          />
          <KpiCard
            label="Sessions"
            value={formatCount(num(current, "sessions"))}
            delta={formatDelta(current ? num(current, "sessions") : null, prior ? num(prior, "sessions") : null)}
          />
          <KpiCard
            label="Page views"
            value={formatCount(num(current, "page_views"))}
            delta={formatDelta(current ? num(current, "page_views") : null, prior ? num(prior, "page_views") : null)}
          />
        </div>

        <h3 className="mt-5 type-label">Visitor trend</h3>
        {trends.isLoading ? (
          <Skeleton className="mt-2 h-56 w-full" />
        ) : trendRows.length === 0 ? (
          <EmptyState className="mt-2" title="No activity yet" description="No traffic recorded for this period." />
        ) : (
          <>
            <div className="mt-2 h-56 w-full" role="img" aria-label={`Line chart of unique visitors per day for ${DATE_RANGE_LABEL[rangeKey]}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="visitors" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-2">
              <summary className="type-body-xs text-muted-foreground">Table equivalent</summary>
              <table className="mt-2 w-full type-body-xs">
                <caption className="sr-only">Unique visitors by day, {DATE_RANGE_LABEL[rangeKey]}</caption>
                <thead>
                  <tr>
                    <th className="text-left">Date</th>
                    <th className="text-left">Unique visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row, i) => (
                    <tr key={i}>
                      <td>{String(row["date"])}</td>
                      <td>{formatCount(Number(row["visitors"]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}

        <h3 className="mt-5 type-label">Top public pages</h3>
        {!topPages || topPages.length === 0 ? (
          <EmptyState className="mt-2" title="No page views yet" />
        ) : (
          <ul className="mt-2 space-y-1">
            {topPages.slice(0, 8).map((p) => (
              <li key={p.path} className="flex justify-between type-body-sm">
                <span>{p.path}</span>
                <span className="text-muted-foreground">{formatCount(p.page_views)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* §36-38 marketplace + funnel */}
      <section aria-labelledby="funnel-heading" className="mt-8">
        <h2 id="funnel-heading" className="type-h3">
          Marketplace funnel
        </h2>
        <p className="mt-1 type-body-xs text-muted-foreground">
          Visitor → account is shown as separate populations, not a fabricated conversion — anonymous browsing
          cannot be reliably attributed to a specific account.
        </p>
        <ol className="mt-3 space-y-2">
          {funnel.map((step) => (
            <li key={step.key} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <span className="type-body-sm font-medium">{step.label}</span>
              <span className="flex items-center gap-2">
                <Badge variant="neutral">{formatCount(step.value)}</Badge>
                {step.conversionFromPrevious !== null ? (
                  <span className="type-body-xs text-muted-foreground">{Math.round(step.conversionFromPrevious)}% of previous step</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* §39-41 Spacilo AI */}
      <section aria-labelledby="ai-heading" className="mt-8">
        <h2 id="ai-heading" className="type-h3">
          Spacilo AI
        </h2>
        {!eventCounts || Object.keys(eventCounts).length === 0 ? (
          <EmptyState className="mt-2" title="No Spacilo AI activity yet" />
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              ["spacefit_stuff_started", "Scan my stuff — started"],
              ["spacefit_stuff_completed", "Scan my stuff — completed"],
              ["spacefit_space_started", "Scan my space — started"],
              ["spacefit_space_completed", "Scan my space — completed"],
              ["live_scan_started", "Live Scan started"],
              ["scan_photo_fallback_used", "Photo-upload fallback"],
              ["scan_manual_fallback_used", "Manual measurement fallback"],
              ["guest_scan_result_viewed", "Guest result viewed"],
              ["guest_scan_claimed", "Guest result claimed after signup"],
            ]
              .filter(([key]) => (eventCounts as Record<string, number>)[key as string] !== undefined)
              .map(([key, label]) => (
                <li key={key} className="flex justify-between rounded-xl border border-border bg-card p-3 type-body-sm">
                  <span>{label}</span>
                  <span>{formatCount((eventCounts as Record<string, number>)[key as string])}</span>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-2 type-body-xs text-muted-foreground">
          Only steps that exist in the event taxonomy are shown. Attribution beyond a single signed-in/guest
          session is not available.
        </p>
      </section>

      {/* §42-47 financial */}
      <section aria-labelledby="financial-heading" className="mt-8">
        <h2 id="financial-heading" className="type-h3">
          Financial overview
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {financial.map((f) => (
            <div key={f.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="type-body-xs text-muted-foreground">{f.label}</p>
              <p className="mt-1 type-h3">{f.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 type-body-xs text-muted-foreground">
          Gross booking value and paid value are distinct concepts and are never combined into a single figure.
        </p>
      </section>

      {/* §48 operational attention */}
      <section aria-labelledby="attention-heading" className="mt-8">
        <h2 id="attention-heading" className="type-h3">
          Needs attention
        </h2>
        {!hasAttention ? (
          <Alert tone="success" title="All clear" className="mt-2">
            Nothing needs your attention right now.
          </Alert>
        ) : (
          <ul className="mt-2 space-y-1">
            {attentionItems
              .filter((a) => Number(a.value) > 0)
              .map((a) => (
                <li key={a.label} className="flex justify-between rounded-xl border border-warning/30 bg-warning-soft p-3 type-body-sm">
                  <span>{a.label}</span>
                  <span>{formatCount(Number(a.value))}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* §49 exports */}
      <section aria-labelledby="export-heading" className="mt-8">
        <h2 id="export-heading" className="type-h3">
          Export
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportFinancial}>
            Financial summary (CSV)
          </Button>
          <Button variant="secondary" onClick={exportMarketplace}>
            Marketplace summary (CSV)
          </Button>
          <Button variant="secondary" onClick={exportTraffic}>
            Traffic summary (CSV)
          </Button>
        </div>
      </section>
    </AppLayout>
  );
}
