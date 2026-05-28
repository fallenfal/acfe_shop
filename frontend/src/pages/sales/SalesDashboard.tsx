import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ExpiryAlertsWidget } from "../../components/datechecks/ExpiryAlertsWidget";
import { HighlightedMemos } from "../../components/memos/HighlightedMemos";
import { TrainingWidget } from "../../components/training/TrainingWidget";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchOrgSalesComparison,
  fetchProductPerformance,
  fetchSalesDashboard,
  fetchSalesTrends,
} from "../../api/sales";
import { Leaderboard } from "../../components/sales/Leaderboard";
import { LocationComparison } from "../../components/sales/LocationComparison";
import { useAuth } from "../../contexts/AuthContext";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { formatCurrency } from "../../lib/format";
import {
  canReadDateChecks,
  canViewSalesDashboard,
  canViewSalesFinancials,
  hasPermissionAtLocation,
} from "../../lib/permissions";
import {
  CATEGORY_CHART_COLORS,
  CHART_HOURS,
  formatHourLabel,
  menuCategoryLabel,
  todayDateParam,
} from "../../lib/salesLabels";
import type {
  LeaderboardMetric,
  OrgSalesComparison,
  ProductPerformance,
  SalesDashboard as SalesDashboardData,
  SalesTrends,
  TrendsPeriod,
} from "../../types/sales";

const inputClass =
  "rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function SalesDashboard() {
  const { user } = useAuth();
  const { locationId, locationRevision } = useLocation();
  const [selectedDate, setSelectedDate] = useState(todayDateParam);
  const [trendsPeriod, setTrendsPeriod] = useState<TrendsPeriod>("30d");
  const [leaderboardMetric, setLeaderboardMetric] =
    useState<LeaderboardMetric>("revenue");

  const [dashboard, setDashboard] = useState<SalesDashboardData | null>(null);
  const [trends, setTrends] = useState<SalesTrends | null>(null);
  const [products, setProducts] = useState<ProductPerformance | null>(null);
  const [orgComparison, setOrgComparison] = useState<OrgSalesComparison | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAllLocations = locationId === ALL_LOCATIONS_ID;
  const canView = canViewSalesDashboard(user, locationId);
  const canFinancials = canViewSalesFinancials(user, locationId);
  const showExpiryWidget =
    Boolean(locationId) &&
    locationId !== ALL_LOCATIONS_ID &&
    canReadDateChecks(user, locationId);
  const showHighlightedMemos =
    Boolean(locationId) &&
    locationId !== ALL_LOCATIONS_ID &&
    hasPermissionAtLocation(user, locationId, "memos.read");
  const showTrainingWidget =
    Boolean(locationId) &&
    locationId !== ALL_LOCATIONS_ID &&
    hasPermissionAtLocation(user, locationId, "training.read");

  const load = useCallback(async () => {
    if (!locationId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [dash, trendData, perf, comparison] = await Promise.all([
        fetchSalesDashboard(locationId, selectedDate),
        fetchSalesTrends(locationId, trendsPeriod),
        canFinancials
          ? fetchProductPerformance(locationId, selectedDate, selectedDate)
          : Promise.resolve(null),
        isAllLocations
          ? fetchOrgSalesComparison(selectedDate, selectedDate)
          : Promise.resolve(null),
      ]);
      setDashboard(dash);
      setTrends(trendData);
      setProducts(perf);
      setOrgComparison(comparison);
    } catch {
      setError("Could not load sales dashboard.");
    } finally {
      setLoading(false);
    }
  }, [
    locationId,
    selectedDate,
    trendsPeriod,
    isAllLocations,
    canView,
    canFinancials,
    locationRevision,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const hourlyChart = useMemo(() => {
    const byHour = new Map(
      (dashboard?.hourly_breakdown ?? []).map((r) => [r.hour, r]),
    );
    return CHART_HOURS.map((hour) => {
      const row = byHour.get(hour);
      return {
        hour,
        label: formatHourLabel(hour),
        revenue: row?.revenue ?? 0,
        transactions: row?.transactions ?? 0,
      };
    });
  }, [dashboard]);

  const categoryChart = useMemo(
    () =>
      (dashboard?.category_breakdown ?? []).map((row, i) => ({
        name: menuCategoryLabel(row.category),
        value: row.revenue,
        quantity: row.quantity,
        fill: CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length],
      })),
    [dashboard],
  );

  const topItemsChart = useMemo(
    () =>
      (dashboard?.top_items ?? []).slice(0, 10).map((item) => ({
        name:
          item.name.length > 16 ? `${item.name.slice(0, 14)}…` : item.name,
        revenue: item.revenue,
        fullName: item.name,
      })),
    [dashboard],
  );

  const trendChart = useMemo(
    () =>
      (trends?.data ?? []).map((d) => ({
        date: d.date.slice(5),
        revenue: d.revenue,
        transactions: d.transactions,
      })),
    [trends],
  );

  const topSellers = useMemo(() => {
    const items =
      products?.items ??
      (dashboard?.top_items ?? []).map((item) => ({
        ...item,
        category: item.category ?? "other",
      }));
    return items.map((item, index) => ({
      rank: index + 1,
      ...item,
      avg_price: item.quantity > 0 ? item.revenue / item.quantity : 0,
    }));
  }, [products, dashboard]);

  const slowMovers = useMemo(() => {
    const fromApi = dashboard?.slow_movers ?? [];
    if (fromApi.length) return fromApi;
    return (products?.items ?? []).filter((i) => i.quantity > 0 && i.quantity < 5);
  }, [dashboard, products]);

  if (!canView) {
    return (
      <p className="rounded-lg bg-cream-100 px-4 py-6 text-center text-sm text-brown-700">
        You do not have permission to view the sales dashboard.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brown-900">
            Sales Dashboard
          </h1>
          <p className="mt-1 text-sm text-brown-600">
            Revenue, trends, and product performance
          </p>
        </div>
        {(showExpiryWidget || showTrainingWidget) && locationId && (
          <div className="flex w-full max-w-md shrink-0 flex-col gap-3 sm:flex-row sm:items-stretch">
            {showExpiryWidget && (
              <div className="w-full flex-1 sm:max-w-xs">
                <ExpiryAlertsWidget locationId={locationId} />
              </div>
            )}
            {showTrainingWidget && (
              <div className="w-full flex-1 sm:max-w-xs">
                <TrainingWidget locationId={locationId} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cream-200 bg-white/90 p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Date
          <input
            type="date"
            value={selectedDate}
            max={todayDateParam()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {showHighlightedMemos && locationId && (
        <HighlightedMemos locationId={locationId} />
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-brown-600">
          Loading dashboard…
        </p>
      ) : dashboard ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total revenue"
              value={formatCurrency(dashboard.today.total_revenue)}
              changePct={dashboard.today.vs_last_week.revenue_change_pct}
              positiveIsGood
            />
            <KpiCard
              label="Transactions"
              value={String(dashboard.today.transaction_count)}
              changePct={dashboard.today.vs_last_week.transaction_change_pct}
              positiveIsGood
            />
            <KpiCard
              label="Avg. transaction"
              value={formatCurrency(dashboard.today.average_transaction)}
              changePct={null}
            />
            <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
                Waste % of revenue
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-amber-brand-dark">
                {(dashboard.today.waste_percentage ?? 0).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-brown-600">
                From daily summary & waste logs
              </p>
            </div>
          </div>

          {isAllLocations && orgComparison && (
            <section className="space-y-4">
              <h2 className="font-display text-xl font-bold text-brown-900">
                Location overview
              </h2>
              <LocationComparison locations={orgComparison.locations} />
              <Leaderboard
                locations={orgComparison.locations}
                metric={leaderboardMetric}
                onMetricChange={setLeaderboardMetric}
              />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Hourly revenue" icon={<BarChart3 className="h-4 w-4" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hourlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Revenue",
                    ]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="#c17f3a"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Category breakdown">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Revenue",
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs text-brown-700">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Revenue trend">
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["7d", "7 days"],
                    ["30d", "30 days"],
                    ["90d", "90 days"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTrendsPeriod(key)}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      trendsPeriod === key
                        ? "bg-amber-brand text-white"
                        : "bg-cream-100 text-brown-700 hover:bg-cream-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Revenue",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#c17f3a"
                    strokeWidth={2}
                    dot={{ fill: "#c17f3a", r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 10 items (revenue)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topItemsChart} layout="vertical" margin={{ left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 9 }}
                  />
                  <Tooltip
                    formatter={(v, _n, props) => [
                      formatCurrency(Number(v ?? 0)),
                      (props as { payload?: { fullName?: string } }).payload
                        ?.fullName ?? "Revenue",
                    ]}
                  />
                  <Bar dataKey="revenue" fill="#a66a2f" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DataTable
              title="Top sellers"
              emptyMessage="No sales recorded for this date."
              columns={[
                "Rank",
                "Item",
                "Category",
                "Qty",
                "Revenue",
                "Avg price",
              ]}
              rows={topSellers.map((row) => [
                String(row.rank),
                row.name,
                menuCategoryLabel(row.category),
                String(row.quantity),
                formatCurrency(row.revenue),
                formatCurrency(row.avg_price),
              ])}
            />
            <DataTable
              title="Slow movers"
              subtitle="Fewer than 5 sold today"
              emptyMessage="No slow movers for this date."
              columns={["Item", "Qty", "Revenue"]}
              rows={slowMovers.map((row) => [
                row.name,
                String(row.quantity),
                formatCurrency(row.revenue),
              ])}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  changePct,
  positiveIsGood = true,
}: {
  label: string;
  value: string;
  changePct: number | null;
  positiveIsGood?: boolean;
}) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-brown-900">
        {value}
      </p>
      {changePct !== null && (
        <ChangeIndicator pct={changePct} positiveIsGood={positiveIsGood} />
      )}
    </div>
  );
}

function ChangeIndicator({
  pct,
  positiveIsGood,
}: {
  pct: number;
  positiveIsGood: boolean;
}) {
  if (pct === 0) {
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-brown-600">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        Same as last week
      </p>
    );
  }
  const up = pct > 0;
  const good = positiveIsGood ? up : !up;
  const Arrow = up ? ArrowUp : ArrowDown;
  const TrendIcon = good ? TrendingUp : TrendingDown;
  const color = good ? "text-green-700" : "text-red-700";

  return (
    <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${color}`}>
      <TrendIcon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(pct).toFixed(1)}% vs last week
      <Arrow className="h-3.5 w-3.5" aria-hidden />
    </p>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brown-800">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataTable({
  title,
  subtitle,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white shadow-sm">
      <div className="border-b border-cream-200 px-4 py-3">
        <h3 className="font-display text-lg font-bold text-brown-900">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-brown-600">{subtitle}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead>
            <tr className="border-b border-cream-200 bg-cream-50/80 text-xs text-brown-600">
              {columns.map((col) => (
                <th key={col} className="px-4 py-2 font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-cream-100">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-2 ${
                      j === 1 ? "font-medium text-brown-900" : "text-brown-700"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-brown-600">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
