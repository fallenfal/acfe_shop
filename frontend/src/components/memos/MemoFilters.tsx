import { Pin } from "lucide-react";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS } from "../../lib/memoLabels";
import type { MemoFilters as MemoFiltersType } from "../../types/memo";

interface Props {
  filters: MemoFiltersType;
  onChange: (filters: MemoFiltersType) => void;
}

export function MemoFilters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cream-200 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
      <select
        value={filters.category ?? ""}
        onChange={(e) =>
          onChange({
            ...filters,
            category: e.target.value as MemoFiltersType["category"],
          })
        }
        className="rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-brown-800 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={filters.priority ?? ""}
        onChange={(e) =>
          onChange({
            ...filters,
            priority: e.target.value as MemoFiltersType["priority"],
          })
        }
        className="rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-brown-800 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
        aria-label="Filter by priority"
      >
        <option value="">All priorities</option>
        {PRIORITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-brown-800 has-checked:border-amber-brand has-checked:bg-amber-100/50">
        <input
          type="checkbox"
          checked={filters.is_pinned === true}
          onChange={(e) =>
            onChange({
              ...filters,
              is_pinned: e.target.checked ? true : undefined,
            })
          }
          className="rounded border-stone-300 text-amber-brand focus:ring-amber-brand"
        />
        <Pin className="h-3.5 w-3.5" aria-hidden />
        Pinned only
      </label>
    </div>
  );
}
