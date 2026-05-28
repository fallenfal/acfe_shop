import { FormEvent, useEffect, useMemo, useState } from "react";
import { adjustStock } from "../../api/inventory";
import { ApiError } from "../../api/client";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import type { StockListItem } from "../../types/inventory";

const inputClass =
  "w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

type AdjustFormType = "delivery" | "correction" | "transfer_out";

export function AdjustmentForm({
  open,
  onClose,
  stockItems,
  initialStockItemId,
  initialType = "delivery",
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  stockItems: StockListItem[];
  initialStockItemId?: string;
  initialType?: AdjustFormType;
  onSuccess?: () => void;
}) {
  const { user } = useAuth();
  const { locationId } = useLocation();
  const [stockItemId, setStockItemId] = useState(initialStockItemId ?? "");
  const [adjustmentType, setAdjustmentType] = useState<AdjustFormType>(initialType);
  const [quantity, setQuantity] = useState("");
  const [quantityChange, setQuantityChange] = useState("");
  const [relatedLocationId, setRelatedLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherLocations = useMemo(
    () => user?.locations.filter((l) => l.id !== locationId) ?? [],
    [user, locationId],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stockItems;
    return stockItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [stockItems, search]);

  useEffect(() => {
    if (open) {
      setStockItemId(initialStockItemId ?? "");
      setAdjustmentType(initialType);
      setQuantity("");
      setQuantityChange("");
      setRelatedLocationId("");
      setNotes("");
      setSearch("");
      setError(null);
    }
  }, [open, initialStockItemId, initialType]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId || !stockItemId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Parameters<typeof adjustStock>[1] = {
        stock_item_id: stockItemId,
        adjustment_type: adjustmentType,
        notes,
      };
      if (adjustmentType === "correction") {
        payload.quantity_change = parseFloat(quantityChange);
      } else {
        payload.quantity = parseFloat(quantity);
      }
      if (adjustmentType === "transfer_out") {
        payload.related_location_id = relatedLocationId;
      }
      await adjustStock(locationId, payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save adjustment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Log adjustment">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Stock item
          </label>
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} mb-2`}
          />
          <select
            required
            value={stockItemId}
            onChange={(e) => setStockItemId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select an item…</option>
            {filteredItems.map((item) => (
              <option key={item.stock_item_id} value={item.stock_item_id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Adjustment type
          </label>
          <select
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value as AdjustFormType)}
            className={inputClass}
          >
            <option value="delivery">Delivery received</option>
            <option value="correction">Manual correction</option>
            <option value="transfer_out">Transfer to another location</option>
          </select>
        </div>

        {adjustmentType === "correction" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Quantity change (+ in / − out)
            </label>
            <input
              type="number"
              step="any"
              required
              value={quantityChange}
              onChange={(e) => setQuantityChange(e.target.value)}
              className={inputClass}
              placeholder="e.g. -2.5 or 10"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Quantity
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
              placeholder="Positive amount"
            />
          </div>
        )}

        {adjustmentType === "transfer_out" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-brown-800">
              Destination location
            </label>
            <select
              required
              value={relatedLocationId}
              onChange={(e) => setRelatedLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select location…</option>
              {otherLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="Optional details…"
          />
        </div>

        <div className="flex gap-2 border-t border-cream-200 pt-4">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? "Saving…" : "Submit"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
