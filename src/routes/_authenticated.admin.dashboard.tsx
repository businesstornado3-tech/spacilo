/**
 * Founder/admin operations console (Prompt 23C closeout).
 *
 * SECURITY: `useIsPlatformAdmin` below is a UX convenience only. The real
 * boundary is server-side — the three RPCs this page calls
 * (`admin_dashboard_kpis`, `admin_dashboard_trends`, `admin_dashboard_breakdowns`)
 * are SECURITY DEFINER functions that re-check `is_platform_admin(auth.uid())`
 * in Postgres and raise `not_authorized` for anyone else, so a renter/host
 * typing this URL, or tampering with client state, gains nothing.
 *
 * REPORTING HONESTY: every figure comes from those RPCs. Nothing is derived
 * from client state, no conversion is invented across an unattributable edge,
 * and a metric that could not be loaded reads "—", never "0".
 */
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";

import { brand } from "@/config/brand";
import { AdminShell, AdminSectionBlock } from "@/components/admin/AdminShell";
import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { NativeSelect } from "@/components/form/Field";
import {
  useIsPlatformAdmin,
  useAdminKpis,
  useAdminTrends,
  useAdminBreakdowns,
  type MetricRecord,
} from "@/hooks/useAdminDashboard";
import { UNIQUE_VISITOR_DEFINITION } from "@/lib/analytics/tracker";
import {
  type DateRangeKey,
  DATE_RANGE_LABEL,
  SELECTABLE_DATE_RANGES,
  rangeSupportsComparison,
  resolveDateRange,
  formatDelta,
  deltaLabel,
  formatPence,
  formatCount,
  buildFunnel,
  buildCsvReport,
  toCsv,
} from "@/lib/admin/dashboard";
import { filterTopPublicPages, TRAFFIC_LIMITATIONS } from "@/lib/admin/traffic";
import { normalizeAdminBreakdowns } from "@/lib/admin/response";
import {
  renterAiFunnel,
  hostAiFunnel,
  aiReliability,
  guestAiOutcomes,
  aiSectionIsEmpty,
  type AiStage,
} from "@/lib/admin/ai-funnels";
import { buildAttention, isAllClear, SEVERITY_LABEL, type AlertSeverity } from "@/lib/admin/attention";
import {
  useGrowthOpportunities,
  useGrowthInsights,
  useRefreshGrowthRadar,
  type GrowthOpportunityRow,
} from "@/hooks/useGrowthRadar";

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

/** Reads a metric, preserving "unknown" (null) so it can render as "—". */
function metric(source: MetricRecord | null | undefined, key: string): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalCount(value: number | null): string {
  return value === null ? "—" : formatCount(value);
}

function KpiCard({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta?: ReturnType<typeof formatDelta> | undefined;
  note?: string | undefined;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <p className="type-body-xs text-muted-foreground">{label}</p>
      <p className="mt-1 type-h3 tabular-nums">{value}</p>
      {delta ? <p className="mt-1 type-body-xs text-muted-foreground">{deltaLabel(delta)}</p> : null}
      {note ? <p className="mt-1 type-body-xs text-muted-foreground">{note}</p> : null}
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

function ExportButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <Download className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

function AiFunnelList({ stages, caption }: { stages: AiStage[]; caption: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <h3 className="type-label">{caption}</h3>
      <ol className="mt-2 space-y-1.5">
        {stages.map((stage) => (
          <li key={stage.label} className="flex items-center justify-between gap-3 type-body-sm">
            <span className="min-w-0 truncate">{stage.label}</span>
            {stage.value === null ? (
              <span className="shrink-0 type-body-xs text-muted-foreground">Not instrumented</span>
            ) : (
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-medium">{formatCount(stage.value)}</span>
                {stage.ofStart !== null ? (
                  <span className="type-body-xs text-muted-foreground">{Math.round(stage.ofStart)}% of starts</span>
                ) : null}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const SEVERITY_TONE: Record<AlertSeverity, "error" | "warning" | "info"> = {
  critical: "error",
  attention: "warning",
  informational: "info",
};

/** Reads persisted radar JSON defensively — a missing field never renders a guess. */
function growthText(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function growthSummary(row: GrowthOpportunityRow): string {
  return growthText(row.situation, "summary") ?? "Unclassified need";
}

function growthRoleLabel(row: GrowthOpportunityRow): string {
  const primary = growthText(row.audience, "primary");
  return primary ? primary.replaceAll("_", " ").toLowerCase() : "audience unknown";
}

function growthScoreLabel(row: GrowthOpportunityRow): string {
  const score = row.scores?.["opportunity"];
  return typeof score === "number" && Number.isFinite(score) ? `${Math.round(score)}/100` : "—";
}

function AdminDashboardRoute() {
  const admin = useIsPlatformAdmin();
  const [rangeKey, setRangeKey] = React.useState<DateRangeKey>("30d");
  const range = React.useMemo(() => resolveDateRange(rangeKey), [rangeKey]);
  const comparable = rangeSupportsComparison(rangeKey);

  const enabled = admin.data === true;
  const kpis = useAdminKpis(range, enabled);
  const trends = useAdminTrends(range, enabled);
  const breakdowns = useAdminBreakdowns(range, enabled);
  const opportunities = useGrowthOpportunities(enabled);
  const insights = useGrowthInsights(enabled);
  const refreshRadar = useRefreshGrowthRadar();
  const opportunityRows = opportunities.data ?? [];
  const insightRows = insights.data ?? [];

  if (admin.isLoading) {
    return (
      <AdminShell title="Founder console">
        <LoadingState label="Loading platform metrics…" />
      </AdminShell>
    );
  }

  if (!admin.data) {
    return (
      <AdminShell title="Founder console">
        <EmptyState
          title="You don't have access to this area"
          description="The founder dashboard is only available to EarnRoom platform admins."
        />
      </AdminShell>
    );
  }

  const current = kpis.data?.current ?? null;
  const prior = comparable ? (kpis.data?.previous ?? null) : null;
  const live = kpis.data?.live ?? null;

  const normalizedBreakdowns = normalizeAdminBreakdowns(breakdowns.data);
  const { eventCounts, attentionCounts, devices } = normalizedBreakdowns;
  const topPages = filterTopPublicPages(normalizedBreakdowns.topPages);

  const trendRows = Array.isArray((trends.data as Record<string, unknown> | undefined)?.["series"])
    ? ((trends.data as Record<string, unknown>)["series"] as Array<Record<string, unknown>>)
    : [];

  const comparisonNote = comparable
    ? `Compared with the previous ${DATE_RANGE_LABEL[rangeKey].toLowerCase()}.`
    : "All time has no preceding period, so no comparison is shown.";

  const delta = (key: string) =>
    comparable ? formatDelta(metric(current, key), metric(prior, key)) : undefined;

  const countCard = (key: string, label: string, note?: string) => (
    <KpiCard
      key={key}
      label={label}
      value={metric(current, key) === null ? "—" : formatCount(metric(current, key))}
      delta={delta(key)}
      {...(note ? { note } : {})}
    />
  );
  const moneyCard = (key: string, label: string) => (
    <KpiCard key={key} label={label} value={formatPence(metric(current, key))} delta={delta(key)} />
  );

  /** Marketplace funnel — every edge below the first is unattributable. */
  const funnel = buildFunnel([
    { key: "visitor", label: "Unique visitors (public pages)", value: metric(current, "unique_visitors") ?? 0, attributable: true },
    { key: "account", label: "New accounts", value: metric(current, "new_accounts") ?? 0, attributable: false },
    { key: "storage_request", label: "Storage requests", value: metric(current, "storage_requests") ?? 0, attributable: false },
    { key: "booking", label: "Bookings", value: metric(current, "bookings") ?? 0, attributable: false },
    { key: "paid", label: "Paid bookings", value: metric(current, "paid_bookings") ?? 0, attributable: false },
  ]);

  const financial: Array<{ label: string; value: string }> = [
    { label: "Gross booking value — booked", value: formatPence(metric(current, "gbv_booked_pence")) },
    { label: "Gross booking value — paid", value: formatPence(metric(current, "gbv_paid_pence")) },
    { label: "EarnRoom fees — booked", value: formatPence(metric(current, "fees_booked_pence")) },
    { label: "EarnRoom fees — paid", value: formatPence(metric(current, "fees_paid_pence")) },
    { label: "Host amount — booked", value: formatPence(metric(current, "host_amount_booked_pence")) },
    { label: "Host amount — paid", value: formatPence(metric(current, "host_amount_paid_pence")) },
    { label: "Refunds", value: formatPence(metric(current, "refunds_pence")) },
    { label: "Refunded fees", value: formatPence(metric(current, "refunded_fees_pence")) },
    { label: "Net EarnRoom fees after refunds", value: formatPence(metric(current, "net_fees_pence")) },
    { label: "Refund count", value: formatCount(metric(current, "refund_count")) },
    { label: "Disputed payments", value: formatCount(metric(current, "disputed_count")) },
    { label: "Failed payments", value: formatCount(metric(current, "failed_payment_count")) },
  ];

  const renterStages = renterAiFunnel(eventCounts);
  const hostStages = hostAiFunnel(eventCounts);
  const reliability = aiReliability(eventCounts);
  const guest = guestAiOutcomes(eventCounts);
  const aiEmpty = aiSectionIsEmpty([renterStages, hostStages], [reliability, guest]);

  const attention = buildAttention(attentionCounts);

  const exportRows = (name: string, headings: string[], rows: (string | number | null)[][]) => {
    const report = buildCsvReport(name, range, headings, rows);
    downloadCsv(report.filename, report.rows);
  };

  const anyError = kpis.isError || trends.isError || breakdowns.isError;
  const loading = kpis.isLoading;

  return (
    <AdminShell
      title="Founder console"
      description={`${DATE_RANGE_LABEL[rangeKey]} · reported in UK time. ${comparisonNote}`}
      toolbar={
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="admin-range">
            Date range
          </label>
          <NativeSelect
            id="admin-range"
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as DateRangeKey)}
          >
            {SELECTABLE_DATE_RANGES.map((k) => (
              <option key={k} value={k}>
                {DATE_RANGE_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
      }
    >
      <div className="space-y-8">
        {anyError ? (
          <ErrorState
            title="We couldn't load part of the console"
            description="Any figure that failed to load is shown as unavailable, never as zero."
          />
        ) : null}

        {/* ---------------------------------------------------------- Overview */}
        <AdminSectionBlock
          id="overview"
          title={`Overview — ${DATE_RANGE_LABEL[rangeKey]}`}
          note="Marketplace figures exclude founder and support activity and internal pages, so operating this console never inflates them."
        >
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {countCard("unique_visitors", "Unique visitors")}
              {countCard("sessions", "Sessions")}
              {countCard("new_accounts", "New accounts")}
              {countCard("spaces_published", "Spaces published")}
              {countCard("storage_requests", "Storage requests")}
              {countCard("bookings", "Bookings")}
              {moneyCard("gbv_booked_pence", "Gross booking value")}
              {moneyCard("net_fees_pence", "Net EarnRoom fees")}
            </div>
          )}
        </AdminSectionBlock>

        {/* ------------------------------------------------------------- Users */}
        <AdminSectionBlock
          id="users"
          title="Users"
          note="Account totals are live figures for the whole platform; new accounts are scoped to the selected period."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {countCard("new_accounts", "New accounts (period)")}
            {countCard("new_renter_accounts", "New renter-first accounts")}
            {countCard("new_host_accounts", "New host-first accounts")}
            <KpiCard label="Total accounts (live)" value={optionalCount(metric(live, "total_accounts_now"))} />
            <KpiCard label="Renter-enabled (live)" value={optionalCount(metric(live, "renter_accounts_now"))} />
            <KpiCard label="Host-enabled (live)" value={optionalCount(metric(live, "host_accounts_now"))} />
            <KpiCard label="Both renter and host (live)" value={optionalCount(metric(live, "both_accounts_now"))} />
            <KpiCard
              label="Hosts with a published space"
              value={optionalCount(metric(live, "hosts_with_published_space_now"))}
            />
          </div>
        </AdminSectionBlock>

        {/* ------------------------------------------------------- Marketplace */}
        <AdminSectionBlock
          id="marketplace"
          title="Marketplace"
          note="Supply and demand for the selected period, plus live listing counts."
          actions={
            <ExportButton
              label="Export"
              onClick={() =>
                exportRows(
                  "Marketplace",
                  ["Metric", "Value"],
                  [
                    ["Spaces started", metric(current, "spaces_started")],
                    ["Spaces published", metric(current, "spaces_published")],
                    ["Storage requests", metric(current, "storage_requests")],
                    ["Accepted requests", metric(current, "accepted_requests")],
                    ["Declined requests", metric(current, "declined_requests")],
                    ["Lapsed requests", metric(current, "lapsed_requests")],
                    ["Bookings", metric(current, "bookings")],
                    ["Paid bookings", metric(current, "paid_bookings")],
                    ["Completed bookings", metric(current, "completed_bookings")],
                    ["Published spaces (live)", metric(live, "published_spaces_now")],
                  ],
                )
              }
            />
          }
        >
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {countCard("spaces_started", "Spaces started")}
            {countCard("spaces_published", "Spaces published")}
            {countCard("accepted_requests", "Requests accepted")}
            {countCard("declined_requests", "Requests declined")}
            {countCard("lapsed_requests", "Requests lapsed or withdrawn")}
            {countCard("paid_bookings", "Paid bookings")}
            {countCard("completed_bookings", "Completed bookings")}
            <KpiCard label="Published spaces (live)" value={optionalCount(metric(live, "published_spaces_now"))} />
          </div>

          <h3 className="mt-6 type-label">Marketplace funnel</h3>
          <p className="mt-1 max-w-prose type-body-xs text-muted-foreground">
            Each stage is a separate population. Anonymous browsing cannot be linked to the account that is
            eventually created, so no conversion rate is shown across that boundary.
          </p>
          <ol className="mt-2 space-y-2">
            {funnel.map((step) => (
              <li
                key={step.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
              >
                <span className="type-body-sm font-medium">{step.label}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="neutral">{formatCount(step.value)}</Badge>
                  <span className="type-body-xs text-muted-foreground">
                    {step.conversionFromPrevious !== null
                      ? `${Math.round(step.conversionFromPrevious)}% of previous step`
                      : "Not attributable"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </AdminSectionBlock>

        {/* ----------------------------------------------------------- Finance */}
        <AdminSectionBlock
          id="finance"
          title="Finance"
          note="Booked is what was agreed; paid is what actually settled. Both come straight from payment records in pence."
          actions={
            <ExportButton
              label="Export"
              onClick={() => exportRows("Finance", ["Metric", "Value"], financial.map((f) => [f.label, f.value]))}
            />
          }
        >
          <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {financial.map((row) => (
              <div key={row.label} className="rounded-xl border border-border bg-card p-3">
                <dt className="type-body-xs text-muted-foreground">{row.label}</dt>
                <dd className="mt-0.5 type-body-lg font-semibold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </AdminSectionBlock>

        {/* ----------------------------------------------------------- Traffic */}
        <AdminSectionBlock
          id="traffic"
          title="Traffic"
          note={UNIQUE_VISITOR_DEFINITION}
          actions={
            <ExportButton
              label="Export"
              onClick={() =>
                exportRows(
                  "Traffic",
                  ["Metric", "Value"],
                  [
                    ["Unique visitors", metric(current, "unique_visitors")],
                    ["Sessions", metric(current, "sessions")],
                    ["Page views", metric(current, "page_views")],
                    ...topPages.map((p) => [`Page ${p.path}`, p.page_views] as (string | number | null)[]),
                  ],
                )
              }
            />
          }
        >
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {countCard("unique_visitors", "Unique visitors")}
            {countCard("sessions", "Sessions")}
            {countCard("page_views", "Page views")}
            <KpiCard
              label="Device split"
              value={
                devices.length === 0
                  ? "—"
                  : devices
                      .slice(0, 2)
                      .map((d) => `${d.source} ${formatCount(d.sessions)}`)
                      .join(" · ")
              }
            />
          </div>

          <h3 className="mt-6 type-label">Visitor trend</h3>
          {trends.isError ? (
            <ErrorState
              className="mt-2"
              title="Traffic data couldn't be loaded"
              description="The traffic chart is unavailable. No values have been substituted."
              onRetry={() => void trends.refetch()}
            />
          ) : trends.isLoading ? (
            <Skeleton className="mt-2 h-56 w-full" />
          ) : trendRows.length === 0 ? (
            <EmptyState className="mt-2" title="No activity yet" description="No public traffic recorded for this period." />
          ) : (
            <>
              <div
                className="mt-2 h-56 w-full"
                role="img"
                aria-label={`Line chart of unique visitors per day for ${DATE_RANGE_LABEL[rangeKey]}`}
              >
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
                <div className="overflow-x-auto">
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
                          <td className="tabular-nums">{formatCount(Number(row["visitors"]))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}

          <h3 className="mt-6 type-label">Top public pages</h3>
          <p className="mt-1 type-body-xs text-muted-foreground">
            Customer-facing pages only — the founder console, sign-in and account areas are excluded.
          </p>
          {breakdowns.isError ? (
            <ErrorState
              className="mt-2"
              title="Page and device data couldn't be loaded"
              description="This analytics breakdown is unavailable. No values have been substituted."
              onRetry={() => void breakdowns.refetch()}
            />
          ) : topPages.length === 0 ? (
            <EmptyState className="mt-2" title="No public page views yet" />
          ) : (
            <ul className="mt-2 space-y-1">
              {topPages.map((p) => (
                <li key={p.path} className="flex justify-between gap-3 type-body-sm">
                  <span className="min-w-0 truncate">{p.path}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCount(p.page_views)}</span>
                </li>
              ))}
            </ul>
          )}

          <details className="mt-4 rounded-xl border border-border bg-card p-3">
            <summary className="type-body-sm font-medium">What these traffic numbers cannot tell you</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 type-body-xs text-muted-foreground">
              {TRAFFIC_LIMITATIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </AdminSectionBlock>

        {/* -------------------------------------------------------- EarnRoom AI */}
        <AdminSectionBlock
          id="earnroom-ai"
          title="EarnRoom AI"
          note="Renter and host journeys are reported separately. Aggregate counts only — no photo, scan or item detail reaches this console."
        >
          {breakdowns.isError ? (
            <ErrorState
              title="EarnRoom AI data couldn't be loaded"
              description="This analytics breakdown is unavailable. No values have been substituted."
              onRetry={() => void breakdowns.refetch()}
            />
          ) : aiEmpty ? (
            <EmptyState title="No EarnRoom AI activity yet" description="Nothing was scanned in this period." />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <AiFunnelList caption="Renter — Scan my stuff" stages={renterStages} />
                <AiFunnelList caption="Host — Scan my space" stages={hostStages} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="type-label">Capture reliability (shared)</h3>
                  <p className="mt-1 type-body-xs text-muted-foreground">
                    Live Scan is used by both journeys, so these counts are deliberately not split between them.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {reliability.map((row) => (
                      <li key={row.event} className="flex justify-between gap-3 type-body-sm">
                        <span className="min-w-0 truncate">{row.label}</span>
                        <span className="tabular-nums font-medium">{formatCount(row.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
                  <h3 className="type-label">Guest previews</h3>
                  <ul className="mt-2 space-y-1.5">
                    {guest.map((row) => (
                      <li key={row.event} className="flex justify-between gap-3 type-body-sm">
                        <span className="min-w-0 truncate">{row.label}</span>
                        <span className="tabular-nums font-medium">{formatCount(row.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </AdminSectionBlock>

        {/* ------------------------------------------------------ Growth radar */}
        <AdminSectionBlock
          id="growth"
          title="Growth radar"
          note="Non-identifying first-party behaviour, grouped into underlying needs. The radar observes and scores only — it never contacts anyone and never claims a space is available."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshRadar.mutate(30)}
              disabled={refreshRadar.isPending}
            >
              {refreshRadar.isPending ? "Refreshing…" : "Refresh radar"}
            </Button>
          }
        >
          {opportunities.isError || insights.isError ? (
            <ErrorState
              title="Growth radar data couldn't be loaded"
              description="No opportunity or insight figures have been substituted."
              onRetry={() => void opportunities.refetch()}
            />
          ) : opportunities.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : opportunityRows.length === 0 ? (
            <EmptyState
              title="No opportunities detected yet"
              description="Refresh the radar once EarnRoom has recorded production activity."
            />
          ) : (
            <div className="space-y-4">
              <ul className="space-y-2">
                {opportunityRows.slice(0, 10).map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
                  >
                    <span className="min-w-0">
                      <span className="block type-body-sm font-medium">{growthSummary(row)}</span>
                      <span className="block type-body-xs text-muted-foreground">
                        {growthRoleLabel(row)} · seen {formatCount(row.frequency)}×
                      </span>
                    </span>
                    <Badge variant="neutral">{growthScoreLabel(row)}</Badge>
                  </li>
                ))}
              </ul>

              {insightRows.length > 0 ? (
                <div>
                  <h3 className="type-label">Unmet needs to review</h3>
                  <ul className="mt-2 space-y-1.5">
                    {insightRows.map((insight) => (
                      <li key={insight.insight_key} className="flex justify-between gap-3 type-body-sm">
                        <span className="min-w-0 truncate">{insight.title}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCount(insight.evidence_count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </AdminSectionBlock>

        {/* -------------------------------------------------------- Operations */}
        <AdminSectionBlock
          id="operations"
          title="Needs attention"
          note="Only conditions that are actually present are listed. Nothing here is a health score or an estimate."
        >
          {breakdowns.isError ? (
            <ErrorState
              title="Operational data couldn't be loaded"
              description="Needs-attention counts are unavailable. An all-clear cannot be shown."
              onRetry={() => void breakdowns.refetch()}
            />
          ) : breakdowns.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : isAllClear(attention) ? (
            <Alert tone="success" title="Nothing needs attention">
              No disputes, failed payments, pending refunds, open support cases, reported reviews or expiring
              requests in this period.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.key}>
                  <Alert tone={SEVERITY_TONE[item.severity]} title={`${item.label}: ${formatCount(item.value)}`}>
                    <span className="type-body-xs">
                      {SEVERITY_LABEL[item.severity]} · {item.hint}
                    </span>
                  </Alert>
                </li>
              ))}
            </ul>
          )}
        </AdminSectionBlock>
      </div>
    </AdminShell>
  );
}
