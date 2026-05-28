import { priorityLabel, priorityStyles } from "../../lib/memoLabels";
import type { MemoPriority } from "../../types/memo";

export function PriorityBadge({ priority }: { priority: MemoPriority }) {
  const styles = priorityStyles(priority);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {priorityLabel(priority)}
    </span>
  );
}
