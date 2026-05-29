import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { ApiError } from "../../api/client";
import { fetchMenuItems } from "../../api/menu";
import { fetchAllStock } from "../../api/inventory";
import {
  completeDateCheck,
  createDateCheck,
  createDateCheckEntry,
  deleteDateCheckEntry,
  fetchDateCheck,
  fetchDateCheckSchedule,
} from "../../api/datechecks";
import { ExpiryStatusBadge } from "../../components/datechecks/ExpiryStatusBadge";
import { StockCategoryTag } from "../../components/inventory/StockCategoryTag";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import {
  computeExpiryStatus,
  entryActionLabel,
  expiryStatusBadgeClass,
} from "../../lib/datecheckLabels";
import { formatDateTime } from "../../lib/format";
import { STOCK_CATEGORIES, stockCategoryLabel } from "../../lib/inventoryLabels";
import { canCreateDateCheck } from "../../lib/permissions";
import type { DateCheckEntryInput, EntryAction } from "../../types/datechecks";
import type { StockListItem } from "../../types/inventory";
import type { MenuItemOption } from "../../api/menu";

type Step = 1 | 2 | 3 | 4;

type SearchItem =
  | { kind: "stock"; id: string; name: string; category: string; unit: string }
  | { kind: "menu"; id: string; name: string; category: string; unit: string };

type DraftRow = {
  localId: string;
  entryId?: string;
  product_name: string;
  category?: string;
  stock_item_id?: string;
  menu_item_id?: string;
  earliest_expiry: string;
  quantity_at_risk: string;
  unit: string;
  action_taken: EntryAction;
  photo?: File | null;
  expiry_status: ReturnType<typeof computeExpiryStatus>;
};

function stockItemToDraftRow(
  item: StockListItem,
  thresholdDays: number,
): DraftRow {
  const expiry = item.latest_expiry_date ?? "";
  return {
    localId: crypto.randomUUID(),
    product_name: item.name,
    category: item.category,
    stock_item_id: item.stock_item_id,
    earliest_expiry: expiry,
    quantity_at_risk: String(item.current_quantity > 0 ? item.current_quantity : 1),
    unit: item.unit,
    action_taken: "none",
    expiry_status: expiry
      ? computeExpiryStatus(expiry, thresholdDays)
      : "ok",
  };
}

const inputClass =
  "w-full min-h-[48px] rounded-lg border border-cream-200 bg-white px-4 py-3 text-base text-brown-900 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

const ACTION_OPTIONS: EntryAction[] = [
  "none",
  "use_first",
  "reduce_price",
  "dispose",
];

export function DateCheckFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeCheckId = searchParams.get("checkId");
  const { user, loading: authLoading } = useAuth();
  const { locationId, locationName, currentRole } = useLocation();
  const canCreate =
    user && locationId
      ? canCreateDateCheck(user, locationId, currentRole)
      : false;

  const [step, setStep] = useState<Step>(1);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [thresholdDays, setThresholdDays] = useState(3);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completeResult, setCompleteResult] = useState<{
    items_checked: number;
    alerts: number;
  } | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set(),
  );

  const searchRef = useRef<HTMLInputElement>(null);

  function toggleCategory(catKey: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  }

  useEffect(() => {
    if (!locationId) return;
    fetchDateCheckSchedule(locationId)
      .then((s) => setThresholdDays(s.alert_threshold_days))
      .catch(() => {});
  }, [locationId]);

  const loadStockRows = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const stock = await fetchAllStock(locationId);
      setRows(stock.map((item) => stockItemToDraftRow(item, thresholdDays)));
    } catch {
      setError("Could not load stock from inventory.");
    } finally {
      setLoading(false);
    }
  }, [locationId, thresholdDays]);

  const loadMenuCatalog = useCallback(async () => {
    try {
      const menu = await fetchMenuItems();
      setCatalog(
        menu.map((m: MenuItemOption) => ({
          kind: "menu" as const,
          id: m.id,
          name: m.name,
          category: m.category,
          unit: "units",
        })),
      );
    } catch {
      setError("Could not load menu items.");
    }
  }, []);

  useEffect(() => {
    if (step === 2) loadMenuCatalog();
  }, [step, loadMenuCatalog]);

  useEffect(() => {
    if (step !== 2 || !checkId || rows.length > 0) return;
    loadStockRows();
  }, [step, checkId, rows.length, loadStockRows]);

  useEffect(() => {
    if (!locationId || !resumeCheckId || checkId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchDateCheck(locationId, resumeCheckId);
        if (cancelled || detail.status !== "in_progress") return;
        setCheckId(detail.id);
        setNotes(detail.notes ?? "");
        const resumed = detail.entries.map((e) => ({
          localId: e.id,
          entryId: e.id,
          product_name: e.product_name,
          stock_item_id: e.stock_item_id ?? undefined,
          menu_item_id: e.menu_item_id ?? undefined,
          earliest_expiry: e.earliest_expiry,
          quantity_at_risk: String(e.quantity_at_risk),
          unit: e.unit,
          action_taken: e.action_taken,
          expiry_status: e.expiry_status,
        }));
        setRows(resumed);
        setStep(2);
        if (resumed.length === 0) {
          await loadStockRows();
        }
      } catch {
        /* start fresh */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, resumeCheckId, checkId, loadStockRows]);

  const stockIdsInRows = useMemo(
    () =>
      new Set(
        rows
          .map((r) => r.stock_item_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [rows],
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((item) => item.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, DraftRow[]>();
    for (const cat of STOCK_CATEGORIES) {
      map.set(cat, []);
    }
    map.set("other", []);
    map.set("menu", []);
    for (const row of rows) {
      const key = row.menu_item_id
        ? "menu"
        : row.category && map.has(row.category)
          ? row.category
          : "other";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    const order = [...STOCK_CATEGORIES, "other", "menu"] as const;
    return order
      .filter((cat) => (map.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({
        category: cat,
        label: cat === "menu" ? "Menu items" : stockCategoryLabel(cat),
        rows: map.get(cat) ?? [],
      }));
  }, [rows]);

  const tally = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    let cost = 0;
    for (const row of rows) {
      if (row.expiry_status === "expired") expired += 1;
      else if (row.expiry_status === "warning" || row.expiry_status === "critical")
        expiring += 1;
    }
    return { total: rows.length, expired, expiring, cost };
  }, [rows]);

  const groupedReview = useMemo(() => {
    const order = ["expired", "critical", "warning", "ok"] as const;
    const groups: Record<string, DraftRow[]> = {};
    for (const o of order) groups[o] = [];
    for (const row of rows) {
      groups[row.expiry_status].push(row);
    }
    return order.filter((k) => groups[k].length > 0).map((k) => ({ key: k, rows: groups[k] }));
  }, [rows]);

  async function handleBegin() {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const check = await createDateCheck(locationId, { notes });
      setCheckId(check.id);
      setStep(2);
    } catch {
      setError("Could not start date check.");
    } finally {
      setLoading(false);
    }
  }

  function addBlankRow() {
    setRows((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        product_name: "",
        earliest_expiry: "",
        quantity_at_risk: "1",
        unit: "units",
        action_taken: "none",
        expiry_status: "ok",
      },
    ]);
  }

  function addFromCatalog(item: SearchItem) {
    if (item.kind === "stock" && stockIdsInRows.has(item.id)) return;
    setRows((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        product_name: item.name,
        category: item.category,
        stock_item_id: item.kind === "stock" ? item.id : undefined,
        menu_item_id: item.kind === "menu" ? item.id : undefined,
        earliest_expiry: "",
        quantity_at_risk: "1",
        unit: item.unit,
        action_taken: "none",
        expiry_status: "ok",
      },
    ]);
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function renderRowCard(row: DraftRow) {
    return (
      <div
        key={row.localId}
        className={`rounded-xl border bg-white p-4 shadow-sm ${
          row.entryId ? "border-[#639922]/40" : "border-cream-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {row.stock_item_id || row.menu_item_id ? (
              <>
                <p className="font-medium text-brown-900">{row.product_name}</p>
                <p className="text-xs text-brown-500">
                  {row.stock_item_id ? "From inventory" : "Menu item"}
                </p>
              </>
            ) : (
              <input
                className={inputClass}
                placeholder="Product name"
                value={row.product_name}
                onChange={(e) =>
                  updateRow(row.localId, { product_name: e.target.value })
                }
              />
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-3 text-brown-500 hover:bg-red-50 hover:text-red-600"
            onClick={() => removeRow(row)}
            aria-label="Remove"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-brown-700">
            Expiry date
            <input
              type="date"
              className={`${inputClass} mt-1`}
              value={row.earliest_expiry}
              onChange={(e) =>
                updateRow(row.localId, { earliest_expiry: e.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium text-brown-700">
            Qty at risk ({row.unit})
            <input
              type="number"
              min={0}
              step="any"
              className={`${inputClass} mt-1`}
              value={row.quantity_at_risk}
              onChange={(e) =>
                updateRow(row.localId, { quantity_at_risk: e.target.value })
              }
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ExpiryStatusBadge status={row.expiry_status} />
          <select
            className={`min-h-[44px] rounded-lg border px-3 text-sm ${expiryStatusBadgeClass(row.expiry_status)}`}
            value={row.action_taken}
            onChange={(e) =>
              updateRow(row.localId, {
                action_taken: e.target.value as EntryAction,
              })
            }
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {entryActionLabel(a)}
              </option>
            ))}
          </select>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-cream-200 px-4 py-2 text-sm">
            <Camera className="h-5 w-5" aria-hidden />
            Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) =>
                updateRow(row.localId, {
                  photo: e.target.files?.[0] ?? null,
                })
              }
            />
          </label>
          {!row.entryId && (
            <Button
              variant="secondary"
              onClick={() => saveRow(row)}
              disabled={loading}
              className="min-h-[44px]"
            >
              Save item
            </Button>
          )}
          {row.entryId && (
            <span className="text-sm text-[#639922]">Saved ✓</span>
          )}
        </div>
      </div>
    );
  }

  function updateRow(localId: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const next = { ...r, ...patch };
        if (patch.earliest_expiry !== undefined || patch.earliest_expiry === "") {
          next.expiry_status = computeExpiryStatus(
            next.earliest_expiry,
            thresholdDays,
          );
          if (next.expiry_status === "expired" && next.action_taken === "none") {
            next.action_taken = "dispose";
          }
        }
        return next;
      }),
    );
  }

  async function saveRow(row: DraftRow) {
    if (!locationId || !checkId) return;
    if (!row.product_name.trim() || !row.earliest_expiry) {
      setError("Product name and expiry date are required.");
      return;
    }
    const qty = parseFloat(row.quantity_at_risk);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Enter a valid quantity.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const input: DateCheckEntryInput = {
        product_name: row.product_name,
        earliest_expiry: row.earliest_expiry,
        quantity_at_risk: qty,
        unit: row.unit,
        action_taken: row.action_taken,
        photo: row.photo,
      };
      if (row.stock_item_id) input.stock_item_id = row.stock_item_id;
      if (row.menu_item_id) input.menu_item_id = row.menu_item_id;

      const entry = await createDateCheckEntry(locationId, checkId, input);
      setRows((prev) =>
        prev.map((r) =>
          r.localId === row.localId ? { ...r, entryId: entry.id } : r,
        ),
      );
      setSearch("");
      searchRef.current?.focus();
    } catch {
      setError("Could not save item.");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(row: DraftRow) {
    if (row.entryId && locationId && checkId) {
      try {
        await deleteDateCheckEntry(locationId, checkId, row.entryId);
      } catch {
        setError("Could not remove item.");
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.localId !== row.localId));
  }

  async function goToReview() {
    const unsaved = rows.filter((r) => !r.entryId);
    for (const row of unsaved) {
      if (row.product_name && row.earliest_expiry) {
        await saveRow(row);
      }
    }
    if (!locationId || !checkId) return;
    try {
      const detail = await fetchDateCheck(locationId, checkId);
      setRows(
        detail.entries.map((e) => ({
          localId: e.id,
          entryId: e.id,
          product_name: e.product_name,
          stock_item_id: e.stock_item_id ?? undefined,
          menu_item_id: e.menu_item_id ?? undefined,
          earliest_expiry: e.earliest_expiry,
          quantity_at_risk: String(e.quantity_at_risk),
          unit: e.unit,
          action_taken: e.action_taken,
          expiry_status: e.expiry_status,
        })),
      );
    } catch {
      /* keep local rows */
    }
    setStep(3);
  }

  async function handleComplete() {
    if (!locationId || !checkId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await completeDateCheck(locationId, checkId);
      const alertCount =
        detail.items_expired +
        detail.items_expiring_soon;
      setCompleteResult({
        items_checked: detail.items_checked,
        alerts: alertCount,
      });
      setStep(4);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not complete date check.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return <p className="text-sm text-brown-600">Loading…</p>;
  }

  if (user && locationId && !canCreate) {
    return (
      <div className="space-y-4">
        <Link
          to="/date-checks"
          className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
        <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
          You do not have permission to run date checks.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <Link
        to="/date-checks"
        className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to date checks
      </Link>

      <div className="flex gap-1">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${step >= s ? "bg-amber-brand" : "bg-cream-200"}`}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {step === 1 && (
        <div className="rounded-xl border border-cream-200 bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold text-brown-900">
            Start date check
          </h1>
          <p className="mt-2 text-brown-600">
            Starting date check for <strong>{locationName}</strong>
          </p>
          <p className="mt-1 text-sm text-brown-500">
            {formatDateTime(new Date().toISOString())}
          </p>
          <p className="mt-4 text-sm text-brown-700">
            All stock items at this location will be loaded from inventory. Enter
            the expiry date for each product as you check it.
          </p>
          <label className="mt-6 block text-sm font-medium text-brown-800">
            Notes (optional)
            <textarea
              className={`${inputClass} mt-1 min-h-[100px] text-sm`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Checking walk-in fridge only"
            />
          </label>
          <Button
            className="mt-6 w-full min-h-[52px] text-base"
            onClick={handleBegin}
            disabled={loading}
          >
            Begin check
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-xl font-bold text-brown-900">
              Check items
            </h1>
            <p className="mt-1 text-sm text-brown-600">
              {rows.length} items from inventory — enter expiry dates as you go.
            </p>
          </div>

          {loading && rows.length === 0 ? (
            <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
              Loading stock from inventory…
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 text-sm text-brown-800">
                Walk through each product and set the earliest expiry date found.
                Quantities default to current stock levels; last known expiry dates
                are pre-filled when available.
              </div>

              {groupedRows.map(({ category: catKey, label, rows: catRows }) => {
                const isCollapsed = collapsedCategories.has(catKey);
                return (
                  <section
                    key={catKey}
                    className="rounded-xl border border-cream-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-cream-200 px-4 py-3 text-left hover:bg-cream-50/80"
                      onClick={() => toggleCategory(catKey)}
                      aria-expanded={!isCollapsed}
                    >
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-brown-600">
                        {label} ({catRows.length})
                      </h2>
                      {isCollapsed ? (
                        <ChevronDown className="h-5 w-5 shrink-0 text-brown-500" aria-hidden />
                      ) : (
                        <ChevronUp className="h-5 w-5 shrink-0 text-brown-500" aria-hidden />
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-4 p-4">
                        {catRows.map(renderRowCard)}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}

          <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50/50 p-4">
            <p className="mb-2 text-sm font-medium text-brown-800">
              Add menu or custom item
            </p>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brown-500"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                className={`${inputClass} pl-12`}
                placeholder="Search menu items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && filteredCatalog.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-cream-200 bg-white">
                {filteredCatalog.slice(0, 8).map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cream-50"
                      onClick={() => addFromCatalog(item)}
                    >
                      <span className="font-medium text-brown-900">{item.name}</span>
                      <StockCategoryTag category={item.category} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="secondary"
              onClick={addBlankRow}
              className="mt-3 w-full min-h-[44px]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add custom item (not in stock list)
            </Button>
          </div>

          <div className="sticky bottom-4 rounded-xl border border-cream-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <p className="text-center text-sm font-medium text-brown-800">
              {tally.total} items checked — {tally.expired} expired, {tally.expiring}{" "}
              expiring soon
            </p>
            <Button
              className="mt-3 w-full min-h-[52px]"
              onClick={goToReview}
              disabled={rows.length === 0 || loading}
            >
              Review & complete
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h1 className="font-display text-xl font-bold text-brown-900">Review</h1>
          {groupedReview.map(({ key, rows: groupRows }) => (
            <div
              key={key}
              className={`rounded-xl border p-4 ${expiryStatusBadgeClass(key as DraftRow["expiry_status"])}`}
            >
              <h2 className="mb-3 font-semibold capitalize text-brown-900">{key}</h2>
              <ul className="space-y-2">
                {groupRows.map((row) => (
                  <li
                    key={row.localId}
                    className="flex justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm"
                  >
                    <span>
                      {row.product_name} · {row.earliest_expiry} · {row.quantity_at_risk}{" "}
                      {row.unit}
                    </span>
                    <ExpiryStatusBadge status={row.expiry_status} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-center font-medium text-brown-800">
            Total items: {rows.length}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>
              Edit items
            </Button>
            <Button className="flex-1 min-h-[52px]" onClick={handleComplete} disabled={loading}>
              Complete check
            </Button>
          </div>
        </div>
      )}

      {step === 4 && completeResult && (
        <div className="rounded-xl border border-cream-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-display text-xl font-bold text-brown-900">
            Date check completed
          </h1>
          <p className="mt-3 text-brown-700">
            {completeResult.items_checked} items checked. Alerts were generated for
            items that need attention.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate("/date-checks#active-alerts")}>
              View alerts
            </Button>
            <Button variant="secondary" onClick={() => navigate("/date-checks")}>
              Back to dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
