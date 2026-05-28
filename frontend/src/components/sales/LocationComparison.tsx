import { formatCurrency } from "../../lib/format";
import type { OrgSalesLocationRow } from "../../types/sales";

export function LocationComparison({
  locations,
}: {
  locations: OrgSalesLocationRow[];
}) {
  if (!locations.length) {
    return (
      <p className="text-sm text-brown-600">No location data for this date.</p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {locations.map((loc) => (
        <div
          key={loc.location_id}
          className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <h4 className="font-display text-base font-bold text-brown-900">
            {loc.location_name}
          </h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-brown-600">Revenue</dt>
              <dd className="font-semibold text-brown-900">
                {formatCurrency(loc.total_revenue)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-brown-600">Transactions</dt>
              <dd className="font-medium text-brown-800">
                {loc.transaction_count}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-brown-600">Waste % of revenue</dt>
              <dd className="font-medium text-amber-brand-dark">
                {loc.waste_percentage.toFixed(1)}%
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
