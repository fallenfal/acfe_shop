import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  createStockTake,
  fetchAllStock,
  submitStockTakeEntries,
} from "../../api/inventory";
import { StockCategoryTag } from "../../components/inventory/StockCategoryTag";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { hasPermissionAtLocation } from "../../lib/permissions";
import { formatDateTime } from "../../lib/format";
import { STOCK_CATEGORIES, formatQuantity, stockCategoryLabel } from "../../lib/inventoryLabels";
import type { StockListItem, StockTakeEntryInput } from "../../types/inventory";

type Step = 1 | 2 | 3 | 4;

type CountRow = {
  stock_item_id: string;
  name: string;
  category: string;
  unit: string;
  expected: number;
  counted: string;
};

export function StockTakeFlow() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locationId, locationName } = useLocation();
  const canStockTake =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "inventory.stock_take")
      : false;
  const [step, setStep] = useState<Step>(1);
  const [stockTakeId, setStockTakeId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    items_counted: number;
    total_variance: number;
    surplus: number;
    shrinkage: number;
  } | null>(null);

  const loadItems = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const items = await fetchAllStock(locationId);
      setRows(
        items.map((item: StockListItem) => ({
          stock_item_id: item.stock_item_id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          expected: item.current_quantity,
          counted: String(item.current_quantity),
        })),
      );
    } catch {
      setError("Could not load stock items.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (step === 2 && rows.length === 0) {
      loadItems();
    }
  }, [step, rows.length, loadItems]);

  const grouped = useMemo(() => {
    const map = new Map<string, CountRow[]>();
    for (const cat of STOCK_CATEGORIES) {
      map.set(cat, []);
    }
    for (const row of rows) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [rows]);

  const variances = useMemo(() => {
    return rows
      .map((row) => {
        const counted = parseFloat(row.counted);
        if (!Number.isFinite(counted)) return null;
        const variance = counted - row.expected;
        if (variance === 0) return null;
        return { ...row, counted, variance };
      })
      .filter(Boolean) as (CountRow & { counted: number; variance: number })[];
  }, [rows]);

  async function handleStart() {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const { stock_take_id } = await createStockTake(locationId);
      setStockTakeId(stock_take_id);
      setStartedAt(new Date().toISOString());
      setStep(2);
      await loadItems();
    } catch {
      setError("Could not start stock take.");
    } finally {
      setLoading(false);
    }
  }

  function updateCount(stockItemId: string, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.stock_item_id === stockItemId ? { ...r, counted: value } : r,
      ),
    );
  }

  function goToReview() {
    const invalid = rows.some((r) => {
      const n = parseFloat(r.counted);
      return !Number.isFinite(n) || n < 0;
    });
    if (invalid) {
      setError("Enter a valid counted quantity for every item.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function handleSubmit() {
    if (!locationId || !stockTakeId) return;
    setLoading(true);
    setError(null);
    try {
      const entries: StockTakeEntryInput[] = rows.map((r) => ({
        stock_item_id: r.stock_item_id,
        counted_quantity: parseFloat(r.counted),
      }));
      const result = await submitStockTakeEntries(
        locationId,
        stockTakeId,
        entries,
      );
      let surplus = 0;
      let shrinkage = 0;
      for (const e of result.entries) {
        const v = e.variance ?? 0;
        if (v > 0) surplus += v;
        else if (v < 0) shrinkage += Math.abs(v);
      }
      setSubmitResult({
        items_counted: result.items_counted,
        total_variance: result.total_variance,
        surplus,
        shrinkage,
      });
      setStep(4);
    } catch {
      setError("Could not submit stock take.");
    } finally {
      setLoading(false);
    }
  }

  if (user && locationId && !canStockTake) {
    return (
      <div className="space-y-4">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to inventory
        </Link>
        <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
          You do not have permission to run stock takes at this location.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/inventory"
        className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to inventory
      </Link>

      <h1 className="font-display text-2xl font-bold text-brown-900">Stock take</h1>

      <div className="flex gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              step >= s ? "bg-amber-brand" : "bg-cream-200"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {step === 1 && (
        <section className="rounded-xl border border-cream-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-brown-600">Step 1 of 4</p>
          <h2 className="mt-2 font-display text-xl font-bold text-brown-900">
            Starting stock take for {locationName ?? "this location"}
          </h2>
          <p className="mt-2 text-sm text-brown-600">
            {startedAt
              ? formatDateTime(startedAt)
              : `Today, ${formatDateTime(new Date().toISOString())}`}
          </p>
          <p className="mt-4 text-sm text-brown-700">
            You will count every active stock item. Quantities will be updated when
            you submit the final review.
          </p>
          <Button className="mt-6" onClick={handleStart} disabled={loading}>
            {loading ? "Starting…" : "Begin counting"}
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <div>
            <p className="text-sm text-brown-600">Step 2 of 4 · Count items</p>
            <p className="text-sm text-brown-600">
              {locationName} · {startedAt && formatDateTime(startedAt)}
            </p>
          </div>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-brown-600">Loading items…</p>
          ) : (
            grouped.map(([cat, catRows]) => (
              <div
                key={cat}
                className="rounded-xl border border-cream-200 bg-white shadow-sm"
              >
                <h3 className="border-b border-cream-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brown-600">
                  {stockCategoryLabel(cat)}
                </h3>
                <ul className="divide-y divide-cream-100">
                  {catRows.map((row) => {
                    const counted = parseFloat(row.counted);
                    const mismatch =
                      Number.isFinite(counted) && counted !== row.expected;
                    return (
                      <li
                        key={row.stock_item_id}
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                          mismatch ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-brown-900">{row.name}</p>
                          <p className="text-xs text-brown-600">
                            Expected: {formatQuantity(row.expected, row.unit)}
                          </p>
                        </div>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.counted}
                          onChange={(e) =>
                            updateCount(row.stock_item_id, e.target.value)
                          }
                          className="w-28 rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
                          aria-label={`Counted quantity for ${row.name}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={goToReview} disabled={rows.length === 0}>
              Review variances
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <div>
            <p className="text-sm text-brown-600">Step 3 of 4 · Review</p>
            <h2 className="font-display text-xl font-bold text-brown-900">
              Variances before submission
            </h2>
          </div>
          {variances.length === 0 ? (
            <p className="rounded-xl border border-cream-200 bg-white p-5 text-sm text-brown-600 shadow-sm">
              All counts match expected quantities — no variances.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-cream-200 bg-cream-50/80 text-xs text-brown-600">
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Expected</th>
                    <th className="px-4 py-2">Counted</th>
                    <th className="px-4 py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {variances.map((row) => (
                    <tr key={row.stock_item_id} className="border-b border-cream-100">
                      <td className="px-4 py-2">
                        <p className="font-medium">{row.name}</p>
                        <div className="mt-1">
                          <StockCategoryTag category={row.category} />
                        </div>
                      </td>
                      <td className="px-4 py-2">{row.expected}</td>
                      <td className="px-4 py-2">{row.counted}</td>
                      <td
                        className={`px-4 py-2 font-semibold ${
                          row.variance >= 0 ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {row.variance >= 0 ? "+" : ""}
                        {row.variance.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back to counting
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting…" : "Submit stock take"}
            </Button>
          </div>
        </section>
      )}

      {step === 4 && submitResult && (
        <section className="rounded-xl border border-cream-200 bg-white p-6 text-center shadow-sm">
          <CheckCircle2
            className="mx-auto h-12 w-12 text-green-600"
            aria-hidden
          />
          <h2 className="mt-4 font-display text-xl font-bold text-brown-900">
            Stock take complete
          </h2>
          <dl className="mx-auto mt-6 grid max-w-sm gap-3 text-left text-sm">
            <div className="flex justify-between border-b border-cream-100 pb-2">
              <dt className="text-brown-600">Items counted</dt>
              <dd className="font-semibold text-brown-900">
                {submitResult.items_counted}
              </dd>
            </div>
            <div className="flex justify-between border-b border-cream-100 pb-2">
              <dt className="text-brown-600">Total surplus</dt>
              <dd className="font-semibold text-green-700">
                +{submitResult.surplus.toFixed(1)}
              </dd>
            </div>
            <div className="flex justify-between border-b border-cream-100 pb-2">
              <dt className="text-brown-600">Total shrinkage</dt>
              <dd className="font-semibold text-red-700">
                −{submitResult.shrinkage.toFixed(1)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brown-600">Net variance</dt>
              <dd className="font-semibold text-brown-900">
                {submitResult.total_variance >= 0 ? "+" : ""}
                {submitResult.total_variance.toFixed(1)}
              </dd>
            </div>
          </dl>
          <Button className="mt-8" onClick={() => navigate("/inventory")}>
            Back to inventory
          </Button>
        </section>
      )}
    </div>
  );
}
