import { stockCategoryLabel, stockCategoryStyle } from "../../lib/inventoryLabels";
import type { StockCategory } from "../../types/inventory";

export function StockCategoryTag({ category }: { category: StockCategory | string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${stockCategoryStyle(category)}`}
    >
      {stockCategoryLabel(category)}
    </span>
  );
}
