import { Trophy } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import type { LeaderboardMetric, OrgSalesLocationRow } from "../../types/sales";

export function Leaderboard({
  locations,
  metric,
  onMetricChange,
}: {
  locations: OrgSalesLocationRow[];
  metric: LeaderboardMetric;
  onMetricChange: (m: LeaderboardMetric) => void;
}) {
  const sorted = [...locations].sort((a, b) => {
    if (metric === "average_transaction") {
      return b.average_transaction - a.average_transaction;
    }
    return b.total_revenue - a.total_revenue;
  });

  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-brown-900">
          <Trophy className="h-5 w-5 text-amber-brand" aria-hidden />
          Leaderboard
        </h3>
        <div className="flex rounded-lg border border-cream-200 bg-cream-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onMetricChange("revenue")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              metric === "revenue"
                ? "bg-amber-brand text-white shadow-sm"
                : "text-brown-700 hover:bg-cream-100"
            }`}
          >
            By revenue
          </button>
          <button
            type="button"
            onClick={() => onMetricChange("average_transaction")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              metric === "average_transaction"
                ? "bg-amber-brand text-white shadow-sm"
                : "text-brown-700 hover:bg-cream-100"
            }`}
          >
            By avg. sale
          </button>
        </div>
      </div>
      <ol className="space-y-2">
        {sorted.map((loc, index) => {
          const value =
            metric === "average_transaction"
              ? formatCurrency(loc.average_transaction)
              : formatCurrency(loc.total_revenue);
          return (
            <li
              key={loc.location_id}
              className="flex items-center gap-3 rounded-lg border border-cream-100 bg-cream-50/50 px-3 py-2.5"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  index === 0
                    ? "bg-amber-brand text-white"
                    : index === 1
                      ? "bg-amber-brand/30 text-brown-900"
                      : index === 2
                        ? "bg-cream-200 text-brown-800"
                        : "bg-white text-brown-600"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-brown-900">
                  {loc.location_name}
                </p>
                <p className="text-xs text-brown-600">
                  {loc.transaction_count} transactions
                </p>
              </div>
              <span className="shrink-0 font-display text-base font-bold text-brown-900">
                {value}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
