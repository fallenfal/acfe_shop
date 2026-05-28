import { FormEvent, useEffect, useMemo, useState } from "react";
import { createWasteEntry } from "../../api/waste";
import { fetchMenuItems, type MenuItemOption } from "../../api/menu";
import { fetchAllStock } from "../../api/inventory";
import { formatApiError } from "../../api/client";
import { Button } from "../ui/Button";
import { useLocation } from "../../contexts/LocationContext";
import {
  WASTE_REASONS,
  WASTE_SHIFTS,
  defaultWasteShift,
  wasteReasonLabel,
  wasteShiftLabel,
} from "../../lib/wasteLabels";
import type { StockListItem } from "../../types/inventory";
import type { WasteItemType, WasteReason, WasteShift } from "../../types/waste";

const inputClass =
  "w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function WasteLogForm({ onSuccess }: { onSuccess?: () => void }) {
  const { locationId } = useLocation();
  const [itemType, setItemType] = useState<WasteItemType>("menu_item");
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [stockItems, setStockItems] = useState<StockListItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("units");
  const [reason, setReason] = useState<WasteReason>("expired");
  const [reasonNote, setReasonNote] = useState("");
  const [shift, setShift] = useState<WasteShift>(defaultWasteShift());
  const [photo, setPhoto] = useState<File | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    setLoadingItems(true);
    Promise.all([fetchMenuItems(), fetchAllStock(locationId)])
      .then(([menu, stock]) => {
        setMenuItems(menu);
        setStockItems(stock);
      })
      .catch(() => setError("Could not load items."))
      .finally(() => setLoadingItems(false));
  }, [locationId]);

  useEffect(() => {
    setItemId("");
    setSearch("");
  }, [itemType]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (itemType === "menu_item") {
      return menuItems.filter((m) => !q || m.name.toLowerCase().includes(q));
    }
    return stockItems.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [itemType, menuItems, stockItems, search]);

  const selectedStock = stockItems.find((s) => s.stock_item_id === itemId);

  useEffect(() => {
    if (itemType === "stock_item" && selectedStock) {
      setUnit(selectedStock.unit);
    } else if (itemType === "menu_item") {
      setUnit("units");
    }
  }, [itemType, selectedStock]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId || !itemId) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append("item_type", itemType);
    if (itemType === "menu_item") {
      form.append("menu_item", itemId);
    } else {
      form.append("stock_item", itemId);
    }
    form.append("quantity", quantity);
    form.append("unit", unit);
    form.append("reason", reason);
    form.append("shift", shift);
    if (reason === "other" && reasonNote.trim()) {
      form.append("reason_note", reasonNote.trim());
    } else if (reasonNote.trim()) {
      form.append("reason_note", reasonNote.trim());
    }
    if (photo) form.append("photo", photo);

    try {
      await createWasteEntry(locationId, form);
      setItemId("");
      setQuantity("");
      setReasonNote("");
      setPhoto(null);
      setSearch("");
      onSuccess?.();
    } catch (err) {
      setError(formatApiError(err, "Could not log waste."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-red-200/60 bg-white p-5 shadow-sm"
    >
      <h2 className="font-display text-lg font-bold text-brown-900">Quick log</h2>
      <p className="mt-1 text-sm text-brown-600">
        Record waste — stock items deduct from inventory automatically.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex rounded-lg border border-cream-200 bg-cream-50 p-1">
        {(["menu_item", "stock_item"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setItemType(type)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              itemType === type
                ? "bg-white text-red-800 shadow-sm"
                : "text-brown-600 hover:text-brown-900"
            }`}
          >
            {type === "menu_item" ? "Menu item" : "Stock item"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Item
          </label>
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} mb-2`}
          />
          <select
            required
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            disabled={loadingItems}
            className={inputClass}
          >
            <option value="">Select item…</option>
            {itemType === "menu_item"
              ? filteredOptions.map((m) => (
                  <option key={(m as MenuItemOption).id} value={(m as MenuItemOption).id}>
                    {(m as MenuItemOption).name}
                  </option>
                ))
              : filteredOptions.map((s) => (
                  <option
                    key={(s as StockListItem).stock_item_id}
                    value={(s as StockListItem).stock_item_id}
                  >
                    {(s as StockListItem).name}
                  </option>
                ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Quantity
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
              <span className="flex min-w-[4rem] items-center rounded-lg border border-cream-200 bg-cream-50 px-2 text-sm text-brown-600">
                {unit}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Shift
            </label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as WasteShift)}
              className={inputClass}
            >
              {WASTE_SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {wasteShiftLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as WasteReason)}
            className={inputClass}
          >
            {WASTE_REASONS.map((r) => (
              <option key={r} value={r}>
                {wasteReasonLabel(r)}
              </option>
            ))}
          </select>
        </div>

        {reason === "other" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Reason details
            </label>
            <textarea
              rows={2}
              required
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              className={inputClass}
              placeholder="Describe what happened…"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Photo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brown-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cream-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brown-800"
          />
        </div>
      </div>

      <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={submitting}>
        {submitting ? "Logging…" : "Log waste"}
      </Button>
    </form>
  );
}
