import { FormEvent, useEffect, useState } from "react";
import { createOrgStockItem, updateLocationStock } from "../../api/inventory";
import { formatApiError } from "../../api/client";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { useLocation } from "../../contexts/LocationContext";
import { STOCK_CATEGORIES, stockCategoryLabel, unitLabel } from "../../lib/inventoryLabels";
import type { StockCategory } from "../../types/inventory";

const UNITS = ["kg", "g", "l", "ml", "units", "boxes", "bags"] as const;

const inputClass =
  "w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function StockItemForm({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { locationId } = useLocation();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("other");
  const [unit, setUnit] = useState<string>("units");
  const [parLevel, setParLevel] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("other");
      setUnit("units");
      setParLevel("");
      setUnitCost("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createOrgStockItem({
        name: name.trim(),
        category,
        unit,
      });
      const par = parLevel.trim() ? parseFloat(parLevel) : 0;
      const cost = unitCost.trim() ? parseFloat(unitCost) : 0;
      if (par > 0 || cost > 0) {
        await updateLocationStock(locationId, created.id, {
          par_level: par,
          unit_cost: cost,
        });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(formatApiError(err, "Could not create stock item."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add stock item">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <p className="text-sm text-brown-600">
          New items are added to the organisation catalogue and appear at every
          location. Set par level and cost for this location below.
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Name
          </label>
          <input
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Oat milk (barista)"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as StockCategory)}
            className={inputClass}
          >
            {STOCK_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {stockCategoryLabel(cat)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-brown-800">
            Unit
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputClass}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-cream-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brown-600">
            This location (optional)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brown-800">
                Par level
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={parLevel}
                onChange={(e) => setParLevel(e.target.value)}
                className={inputClass}
                placeholder="0"
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
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-cream-200 pt-4">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? "Creating…" : "Add item"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
