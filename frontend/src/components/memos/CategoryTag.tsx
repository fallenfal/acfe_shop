import { categoryLabel } from "../../lib/memoLabels";
import type { MemoCategory } from "../../types/memo";

export function CategoryTag({ category }: { category: MemoCategory }) {
  return (
    <span className="rounded-md bg-cream-200/80 px-2 py-0.5 text-xs font-medium text-brown-700">
      {categoryLabel(category)}
    </span>
  );
}
