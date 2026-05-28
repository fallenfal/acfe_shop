import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import {
  adjustStock,
  fetchStockDetail,
  fetchStockItemDateCheckHistory,
  fetchStockTakeHistoryForItem,
  updateLocationStock,
} from "../../api/inventory";
import { ExpiryStatusBadge } from "../../components/datechecks/ExpiryStatusBadge";
import { ApiError } from "../../api/client";
import { AdjustmentForm } from "../../components/inventory/AdjustmentForm";
import { StockCategoryTag } from "../../components/inventory/StockCategoryTag";
import { StockStatusIndicator } from "../../components/inventory/StockStatusIndicator";
import { Button } from "../../components/ui/Button";
import { useLocation } from "../../contexts/LocationContext";
import { formatCurrency, formatDateTime, formatRelativeTime } from "../../lib/format";
import {
  adjustmentTypeLabel,
  adjustmentTypeStyle,
  formatQuantity,
} from "../../lib/inventoryLabels";
import type { StockDetail, StockItemDateCheckHistory } from "../../types/inventory";

const inputClass =
  "w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function StockItemDetail() {
  const { id: stockItemId } = useParams<{ id: string }>();
  const { locationId } = useLocation();
  const [item, setItem] = useState<StockDetail | null>(null);
  const [takeHistory, setTakeHistory] = useState<
    Awaited<ReturnType<typeof fetchStockTakeHistoryForItem>>
  >([]);
  const [dateCheckHistory, setDateCheckHistory] = useState<
    StockItemDateCheckHistory[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPar, setEditingPar] = useState(false);
  const [parLevel, setParLevel] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [savingPar, setSavingPar] = useState(false);
  const [customQtyOpen, setCustomQtyOpen] = useState(false);
  const [customQty, setCustomQty] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    if (!locationId || !stockItemId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchStockDetail(locationId, stockItemId);
      setItem(detail);
      setParLevel(String(detail.par_level));
      setUnitCost(String(detail.unit_cost));
      try {
        const [history, dateHistory] = await Promise.all([
          fetchStockTakeHistoryForItem(locationId, stockItemId),
          fetchStockItemDateCheckHistory(locationId, stockItemId).catch(
            () => [],
          ),
        ]);
        setTakeHistory(history);
        setDateCheckHistory(dateHistory);
      } catch {
        setTakeHistory([]);
        setDateCheckHistory([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Stock item not found.",
      );
    } finally {
      setLoading(false);
    }
  }, [locationId, stockItemId]);

  useEffect(() => {
    load();
  }, [load]);

  async function quickDelivery(qty: number) {
    if (!locationId || !stockItemId) return;
    setAdjusting(true);
    try {
      await adjustStock(locationId, {
        stock_item_id: stockItemId,
        adjustment_type: "delivery",
        quantity: qty,
      });
      await load();
      setCustomQtyOpen(false);
      setCustomQty("");
    } catch {
      setError("Could not log delivery.");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleCustomDelivery(e: FormEvent) {
    e.preventDefault();
    const qty = parseFloat(customQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    await quickDelivery(qty);
  }

  async function saveParCost(e: FormEvent) {
    e.preventDefault();
    if (!locationId || !stockItemId) return;
    setSavingPar(true);
    try {
      await updateLocationStock(locationId, stockItemId, {
        par_level: parseFloat(parLevel),
        unit_cost: parseFloat(unitCost),
      });
      setEditingPar(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSavingPar(false);
    }
  }

  if (loading) {
    return <p className="text-center text-sm text-brown-600">Loading…</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to inventory
        </Link>
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? "Not found"}
        </p>
      </div>
    );
  }

  const parPct =
    item.par_level > 0
      ? Math.min(100, (item.current_quantity / item.par_level) * 100)
      : item.current_quantity > 0
        ? 100
        : 0;
  const gaugeColor = item.is_below_par ? "bg-red-500" : "bg-green-600";

  const adjustments = item.adjustments.slice(0, 30);

  return (
    <div className="space-y-6">
      <Link
        to="/inventory"
        className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to inventory
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StockCategoryTag category={item.category} />
            <StockStatusIndicator belowPar={item.is_below_par} />
          </div>
          <h1 className="font-display text-2xl font-bold text-brown-900">{item.name}</h1>
          <p className="mt-1 text-sm text-brown-600">
            Stock value: {formatCurrency(item.stock_value)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
          Log adjustment
        </Button>
      </header>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-brown-600">
          Stock level
        </h2>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-brown-900">
              {formatQuantity(item.current_quantity, item.unit)}
            </p>
            <p className="text-sm text-brown-600">
              Par: {formatQuantity(item.par_level, item.unit)}
            </p>
          </div>
          <p className="text-sm text-brown-600">
            {item.last_counted_at
              ? `Last counted ${formatRelativeTime(item.last_counted_at)}`
              : "Not counted yet"}
          </p>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-brown-600">
            <span>Current vs par</span>
            <span>{Math.round(parPct)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-cream-200">
            <div
              className={`h-full rounded-full transition-all ${gaugeColor}`}
              style={{ width: `${parPct}%` }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Quick delivery
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={adjusting}
            onClick={() => quickDelivery(10)}
          >
            +10
          </Button>
          <Button
            variant="secondary"
            disabled={adjusting}
            onClick={() => quickDelivery(50)}
          >
            +50
          </Button>
          <Button
            variant="secondary"
            disabled={adjusting}
            onClick={() => setCustomQtyOpen((v) => !v)}
          >
            Custom
          </Button>
        </div>
        {customQtyOpen && (
          <form onSubmit={handleCustomDelivery} className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              min="0"
              required
              value={customQty}
              onChange={(e) => setCustomQty(e.target.value)}
              className={inputClass}
              placeholder="Quantity"
            />
            <Button type="submit" disabled={adjusting}>
              Add
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brown-600">
            Par level & unit cost
          </h2>
          {!editingPar && (
            <button
              type="button"
              onClick={() => setEditingPar(true)}
              className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          )}
        </div>
        {editingPar ? (
          <form onSubmit={saveParCost} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brown-800">
                Par level
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={parLevel}
                onChange={(e) => setParLevel(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brown-800">
                Unit cost (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={savingPar}>
                <Check className="h-4 w-4" aria-hidden />
                {savingPar ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingPar(false);
                  setParLevel(String(item.par_level));
                  setUnitCost(String(item.unit_cost));
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-brown-600">Par level</dt>
              <dd className="font-medium text-brown-900">
                {formatQuantity(item.par_level, item.unit)}
              </dd>
            </div>
            <div>
              <dt className="text-brown-600">Unit cost</dt>
              <dd className="font-medium text-brown-900">
                {formatCurrency(item.unit_cost)}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Adjustment history
        </h2>
        {adjustments.length === 0 ? (
          <p className="text-sm text-brown-600">No adjustments yet.</p>
        ) : (
          <ul className="space-y-4">
            {adjustments.map((adj) => (
              <li
                key={adj.id}
                className="relative border-l-2 border-cream-200 pl-4"
              >
                <span
                  className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-amber-brand`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${adjustmentTypeStyle(adj.adjustment_type)}`}
                  >
                    {adjustmentTypeLabel(adj.adjustment_type)}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      adj.quantity_change >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {adj.quantity_change >= 0 ? "+" : ""}
                    {adj.quantity_change}
                  </span>
                  <span className="text-xs text-brown-600">
                    {formatRelativeTime(adj.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-brown-600">
                  {adj.created_by_name ?? "Unknown"}
                  {adj.related_location_name &&
                    ` → ${adj.related_location_name}`}
                </p>
                {adj.notes && (
                  <p className="mt-1 text-sm text-brown-800">{adj.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Date check history
        </h2>
        {dateCheckHistory.length === 0 ? (
          <p className="text-sm text-brown-600">
            No date check records for this item at this location.
          </p>
        ) : (
          <ul className="space-y-3">
            {dateCheckHistory.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-cream-200 bg-cream-50/50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-brown-900">
                    {formatDateTime(row.check_date)}
                  </p>
                  <ExpiryStatusBadge status={row.expiry_status} />
                </div>
                <p className="mt-1 text-brown-700">
                  Expiry found:{" "}
                  {new Date(row.earliest_expiry + "T00:00:00").toLocaleDateString()}
                </p>
                <p className="text-xs text-brown-600">
                  Action: {row.action_taken_display}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brown-600">
          Stock take history
        </h2>
        {takeHistory.length === 0 ? (
          <p className="text-sm text-brown-600">No stock take records for this item.</p>
        ) : (
          <ul className="space-y-3">
            {takeHistory.map(({ conducted_at, conducted_by_name, entry }) => (
              <li
                key={entry.id}
                className="rounded-lg border border-cream-200 bg-cream-50/50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-brown-900">
                  {formatDateTime(conducted_at)}
                  {conducted_by_name && (
                    <span className="font-normal text-brown-600">
                      {" "}
                      · {conducted_by_name}
                    </span>
                  )}
                </p>
                <p className="text-brown-700">
                  Counted {entry.counted_quantity} (expected{" "}
                  {entry.expected_quantity ?? "—"})
                  {entry.variance != null && (
                    <span
                      className={
                        entry.variance >= 0 ? " text-green-700" : " text-red-700"
                      }
                    >
                      {" "}
                      · variance {entry.variance >= 0 ? "+" : ""}
                      {entry.variance}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdjustmentForm
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        stockItems={[item]}
        initialStockItemId={stockItemId}
        onSuccess={load}
      />
    </div>
  );
}
