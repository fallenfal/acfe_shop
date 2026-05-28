import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Package,
  Search,
  Plus,
  Truck,
} from "lucide-react";
import { fetchAllStock, fetchStockTakes } from "../../api/inventory";
import { AdjustmentForm } from "../../components/inventory/AdjustmentForm";
import { StockItemForm } from "../../components/inventory/StockItemForm";
import { StockCategoryTag } from "../../components/inventory/StockCategoryTag";
import { ExpiryStatusBadge } from "../../components/datechecks/ExpiryStatusBadge";
import { StockStatusIndicator } from "../../components/inventory/StockStatusIndicator";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { formatCurrency, formatDateTime } from "../../lib/format";
import {
  STOCK_CATEGORIES,
  formatQuantity,
  stockCategoryLabel,
} from "../../lib/inventoryLabels";
import { hasPermissionAtLocation } from "../../lib/permissions";
import type { StockListItem } from "../../types/inventory";

type SortKey = "name" | "category" | "quantity";

export function StockOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locationId } = useLocation();
  const [items, setItems] = useState<StockListItem[]>([]);
  const [lastStockTakeDate, setLastStockTakeDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [belowParOnly, setBelowParOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const canRead =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "inventory.read")
      : false;
  const canCreate =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "inventory.create")
      : false;
  const canUpdate =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "inventory.update")
      : false;
  const canStockTake =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "inventory.stock_take")
      : false;

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const [stock, takes] = await Promise.all([
        fetchAllStock(locationId),
        fetchStockTakes(locationId),
      ]);
      setItems(stock);
      setLastStockTakeDate(takes[0]?.conducted_at ?? null);
    } catch {
      setError("Could not load stock.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const belowParCount = useMemo(
    () => items.filter((i) => i.is_below_par).length,
    [items],
  );

  const totalValue = useMemo(
    () => items.reduce((sum, i) => sum + (i.stock_value ?? 0), 0),
    [items],
  );

  const displayed = useMemo(() => {
    let list = [...items];
    if (category !== "all") {
      list = list.filter((i) => i.category === category);
    }
    if (belowParOnly) {
      list = list.filter((i) => i.is_below_par);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "category")
        cmp = a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      else cmp = a.current_quantity - b.current_quantity;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [items, category, belowParOnly, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortHeader({
    label,
    col,
    className = "",
  }: {
    label: string;
    col: SortKey;
    className?: string;
  }) {
    const active = sortKey === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 font-semibold hover:text-amber-brand-dark ${className}`}
      >
        {label}
        {active &&
          (sortAsc ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          ))}
      </button>
    );
  }

  if (user && locationId && !canRead) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        You do not have permission to view inventory at this location.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brown-900">Inventory</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button variant="secondary" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add item
            </Button>
          )}
          {canStockTake && (
            <Button
              variant="secondary"
              onClick={() => navigate("/inventory/stock-take")}
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              Start Stock Take
            </Button>
          )}
          {canUpdate && (
            <Button onClick={() => setAdjustOpen(true)}>
              <Truck className="h-4 w-4" aria-hidden />
              Log Delivery
            </Button>
          )}
        </div>
      </div>

      {belowParCount > 0 && (
        <button
          type="button"
          onClick={() => setBelowParOnly(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm text-red-900 transition-colors hover:bg-red-50"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span>
            <strong>{belowParCount}</strong>{" "}
            {belowParCount === 1 ? "item is" : "items are"} below par level
          </span>
          <span className="ml-auto text-xs font-medium text-red-700">View →</span>
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
            Total stock value
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-brown-900">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
            Below par
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700">
            {belowParCount}
          </p>
        </div>
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brown-600">
            Last stock take
          </p>
          <p className="mt-1 text-sm font-medium text-brown-900">
            {lastStockTakeDate ? formatDateTime(lastStockTakeDate) : "Never"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cream-200 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-600"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search stock items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-cream-200 py-2 pl-9 pr-3 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              category === "all"
                ? "bg-amber-brand text-white"
                : "bg-cream-100 text-brown-700 hover:bg-cream-200"
            }`}
          >
            All
          </button>
          {STOCK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-amber-brand text-white"
                  : "bg-cream-100 text-brown-700 hover:bg-cream-200"
              }`}
            >
              {stockCategoryLabel(cat)}
            </button>
          ))}
          {belowParOnly && (
            <button
              type="button"
              onClick={() => setBelowParOnly(false)}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800"
            >
              Clear below-par filter ×
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-center text-sm text-brown-600">Loading stock…</p>
      ) : displayed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-200 bg-cream-100/50 py-12 text-center text-brown-600">
          No stock items match your filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/80 text-xs text-brown-600">
                  <th className="px-4 py-3">
                    <SortHeader label="Name" col="name" />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Category" col="category" />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Quantity" col="quantity" />
                  </th>
                  <th className="px-4 py-3">Par level</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Latest expiry</th>
                  <th className="px-4 py-3 text-right">Unit cost</th>
                  <th className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/inventory/${item.stock_item_id}`}
                        className="font-medium text-brown-900 hover:text-amber-brand-dark"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StockCategoryTag category={item.category} />
                    </td>
                    <td className="px-4 py-3 text-brown-800">
                      {formatQuantity(item.current_quantity, item.unit)}
                    </td>
                    <td className="px-4 py-3 text-brown-600">
                      {formatQuantity(item.par_level, item.unit)}
                    </td>
                    <td className="px-4 py-3">
                      <StockStatusIndicator belowPar={item.is_below_par} />
                    </td>
                    <td className="px-4 py-3">
                      {item.latest_expiry_date && item.latest_expiry_status ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-brown-800">
                            {new Date(
                              item.latest_expiry_date + "T00:00:00",
                            ).toLocaleDateString()}
                          </span>
                          <ExpiryStatusBadge status={item.latest_expiry_status} />
                        </div>
                      ) : (
                        <span className="text-brown-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-brown-600">
                      {formatCurrency(item.unit_cost)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-brown-900">
                      {formatCurrency(item.stock_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-brown-600">
          <Package className="h-3.5 w-3.5" aria-hidden />
          {displayed.length} of {items.length} items shown
        </p>
      )}

      <AdjustmentForm
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        stockItems={items}
        initialType="delivery"
        onSuccess={load}
      />

      <StockItemForm
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onSuccess={load}
      />
    </div>
  );
}
