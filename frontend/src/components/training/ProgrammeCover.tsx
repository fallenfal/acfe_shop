import type { TrainingCategory } from "../../types/training";
import { categoryIcon } from "../../lib/trainingLabels";

export function ProgrammeCover({
  coverImage,
  category,
  title,
  className = "h-32",
}: {
  coverImage: string | null;
  category: TrainingCategory;
  title: string;
  className?: string;
}) {
  if (coverImage) {
    return (
      <img
        src={coverImage}
        alt=""
        className={`w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex w-full items-center justify-center bg-gradient-to-br from-cream-100 to-cream-200 ${className}`}
      aria-hidden
    >
      <span className="text-4xl" title={title}>
        {categoryIcon(category)}
      </span>
    </div>
  );
}
