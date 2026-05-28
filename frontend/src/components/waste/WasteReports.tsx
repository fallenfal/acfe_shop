import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  fetchAllWaste,
  fetchWasteSummary,
  fetchWasteTrends,
  periodToQuery,
  previousPeriodQuery,
} from "../../api/waste";
import { Button } from "../ui/Button";
import { useLocation } from "../../contexts/LocationContext";
import { formatCurrency } from "../../lib/format";
import { exportWasteEntriesCsv } from "../../lib/exportCsv";
import {
  wasteEntryItemName,
  wasteReasonLabel,
  wasteShiftLabel,
} from "../../lib/wasteLabels";
import type { WasteEntry, WastePeriodPreset, WasteSummary } from "../../types/waste";
import { WasteReasonBadge } from "./WasteReasonBadge";

const REASON_COLORS = [
  "#b91c1c",
  "#c2410c",
  "#d97706",
  "#ea580c",
  "#dc2626",
  "#991b1b",
  "#78716c",
];

const SHIFT_COLORS = ["#f59e0b", "#dc2626", "#7c2d12"];

const inputClass =
  "rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function WasteReports() {
  const { locationId } = useLocation();
  const [preset, setPreset] = useState<WastePeriodPreset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState<WasteSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<WasteSummary | null>(null);
  const [trends, setTrends] = useState<{ date: string; total_cost: number }[]>([]);
  const [entries, setEntries] = useState<WasteEntry[]>([]);
  const [reasonGroup, setReasonGroup] = useState<"all" | "expired" | "other">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodParams = useMemo(
    () => periodToQuery(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const load = useCallback(async () => {
    if (!locationId) return;
    if (preset === "custom" && (!customFrom || !customTo)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const prevParams = previousPeriodQuery(preset, customFrom, customTo);
      const listParams = {
        ...periodParams,
        ...(reasonGroup === "all"
          ? {}
          : { reason_group: reasonGroup }),
      };
      const [sum, prev, trendData, list] = await Promise.all([
        fetchWasteSummary(locationId, periodParams),
        fetchWasteSummary(locationId, prevParams),
        fetchWasteTrends(locationId, periodParams),
        fetchAllWaste(locationId, listParams),
      ]);
      setSummary(sum);
      setPrevSummary(prev);
      setTrends(
        trendData.data.map((d) => ({
          date: d.date.slice(5),
          total_cost: d.total_cost,
        })),
      );
      setEntries(list);
    } catch {
      setError("Could not load waste reports.");
    } finally {
      setLoading(false);
    }
  }, [locationId, periodParams, preset, customFrom, customTo, reasonGroup]);

  useEffect(() => {
    load();
  }, [load]);

  const costDelta = useMemo(() => {
    if (!summary || !prevSummary) return null;
    const cur = summary.total_waste_cost;
    const prev = prevSummary.total_waste_cost;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  }, [summary, prevSummary]);

  const reasonChart = useMemo(
    () =>
      (summary?.waste_by_reason ?? []).map((r) => ({
        name: wasteReasonLabel(r.reason),
        cost: r.total_cost,
        count: r.count,
      })),
    [summary],
  );

  const itemChart = useMemo(
    () =>
      (summary?.waste_by_item ?? []).map((i) => ({
        name:
          i.item_name.length > 18
            ? `${i.item_name.slice(0, 16)}…`
            : i.item_name,
        cost: i.total_cost,
        fullName: i.item_name,
      })),
    [summary],
  );

  const shiftChart = useMemo(
    () =>
      (summary?.waste_by_shift ?? []).map((s) => ({
        name: wasteShiftLabel(s.shift),
        value: s.total_cost,
      })),
    [summary],
  );

  function handleExport() {
    const label =
      preset === "custom"
        ? `${customFrom}_${customTo}`
        : preset;
    exportWasteEntriesCsv(entries, `waste-${label}.csv`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cream-200 bg-white/80 p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Period
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["week", "This week"],
              ["month", "This month"],
              ["last30", "Last 30 days"],
              ["custom", "Custom range"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === key
                  ? "bg-red-700 text-white"
                  : "bg-cream-100 text-brown-700 hover:bg-cream-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-center text-sm text-brown-600">Loading reports…</p>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Total waste cost"
              value={formatCurrency(summary.total_waste_cost)}
              tone="danger"
            />
            <SummaryCard
              label="Items wasted"
              value={String(summary.total_waste_count)}
              tone="warning"
            />
            <SummaryCard
              label="Waste % of revenue"
              value={
                summary.waste_as_percentage_of_revenue != null
                  ? `${summary.waste_as_percentage_of_revenue}%`
                  : "—"
              }
              tone="neutral"
            />
            <TrendCard delta={costDelta} />
          </div>

          {summary.waste_expired_breakdown && (
            <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-brown-800">
                Expired products vs other waste
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setReasonGroup("expired")}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    reasonGroup === "expired"
                      ? "border-red-300 bg-red-50"
                      : "border-cream-200 bg-cream-50/50 hover:bg-cream-100"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    Waste from expired products
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-red-800">
                    {formatCurrency(summary.waste_expired_breakdown.expired.total_cost)}
                  </p>
                  <p className="mt-1 text-xs text-brown-600">
                    {summary.waste_expired_breakdown.expired.count} entries
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setReasonGroup("other")}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    reasonGroup === "other"
                      ? "border-amber-300 bg-amber-50"
                      : "border-cream-200 bg-cream-50/50 hover:bg-cream-100"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-700">
                    All other reasons
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-brown-900">
                    {formatCurrency(summary.waste_expired_breakdown.other.total_cost)}
                  </p>
                  <p className="mt-1 text-xs text-brown-600">
                    {summary.waste_expired_breakdown.other.count} entries
                  </p>
                </button>
              </div>
              {reasonGroup !== "all" && (
                <button
                  type="button"
                  onClick={() => setReasonGroup("all")}
                  className="mt-3 text-xs font-medium text-amber-brand-dark hover:underline"
                >
                  Show all entries
                </button>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Waste by reason">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={reasonChart} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="£" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Cost",
                    ]}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {reasonChart.map((_, i) => (
                      <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Daily waste trend">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Cost",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_cost"
                    stroke="#b91c1c"
                    strokeWidth={2}
                    dot={{ fill: "#b91c1c", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top wasted items (by cost)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={itemChart} margin={{ bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe3d6" />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={70}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v, _n, props) => [
                      formatCurrency(Number(v ?? 0)),
                      (props as { payload?: { fullName?: string } }).payload
                        ?.fullName ?? "Cost",
                    ]}
                  />
                  <Bar dataKey="cost" fill="#c2410c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Waste by shift">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={shiftChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {shiftChart.map((_, i) => (
                      <Cell key={i} fill={SHIFT_COLORS[i % SHIFT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [
                      formatCurrency(Number(v ?? 0)),
                      "Cost",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="rounded-xl border border-cream-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 px-4 py-3">
              <h3 className="font-display text-lg font-bold text-brown-900">
                {reasonGroup === "expired"
                  ? "Expired product waste"
                  : reasonGroup === "other"
                    ? "Other waste"
                    : "All entries"}{" "}
                ({entries.length})
              </h3>
              <Button variant="secondary" onClick={handleExport} disabled={!entries.length}>
                <Download className="h-4 w-4" aria-hidden />
                Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-cream-200 bg-cream-50/80 text-xs text-brown-600">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Reason</th>
                    <th className="px-4 py-2">Shift</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-cream-100">
                      <td className="px-4 py-2 text-brown-600">
                        {new Date(e.logged_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 font-medium text-brown-900">
                        {wasteEntryItemName(e)}
                      </td>
                      <td className="px-4 py-2 text-brown-700">
                        {e.quantity} {e.unit}
                      </td>
                      <td className="px-4 py-2">
                        <WasteReasonBadge reason={e.reason} />
                      </td>
                      <td className="px-4 py-2 text-brown-600">
                        {wasteShiftLabel(e.shift)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-red-700">
                        {formatCurrency(e.cost_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length === 0 && (
                <p className="py-8 text-center text-sm text-brown-600">
                  No waste entries in this period.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "danger" | "warning" | "neutral";
}) {
  const tones = {
    danger: "border-red-200 bg-red-50/50",
    warning: "border-amber-200 bg-amber-50/50",
    neutral: "border-cream-200 bg-white",
  };
  const valueColors = {
    danger: "text-red-800",
    warning: "text-amber-900",
    neutral: "text-brown-900",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold ${valueColors[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function TrendCard({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
          vs previous period
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm text-brown-600">
          <Minus className="h-4 w-4" /> —
        </p>
      </div>
    );
  }
  const improved = delta < 0;
  const Icon = improved ? TrendingDown : TrendingUp;
  const color = improved ? "text-green-700" : "text-red-700";
  const bg = improved ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60";
  const Arrow = delta >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${bg}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
        vs previous period
      </p>
      <p className={`mt-1 flex items-center gap-2 font-display text-2xl font-bold ${color}`}>
        <Icon className="h-6 w-6" aria-hidden />
        {Math.abs(delta).toFixed(1)}%
        <Arrow className="h-5 w-5" aria-hidden />
      </p>
      <p className="mt-1 text-xs text-brown-600">
        {improved ? "Lower waste — good" : "Higher waste than last period"}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-brown-800">{title}</h3>
      {children}
    </div>
  );
}
