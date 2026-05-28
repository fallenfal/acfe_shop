import type { TrainingCategory } from "../../types/training";
import { categoryLabel } from "../../lib/trainingLabels";

export function CategoryBadge({ category }: { category: TrainingCategory }) {
  return (
    <span className="inline-flex rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-medium text-brown-700">
      {categoryLabel(category)}
    </span>
  );
}
