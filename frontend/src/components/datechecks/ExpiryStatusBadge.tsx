import { expiryStatusBadgeClass, expiryStatusLabel } from "../../lib/datecheckLabels";
import type { ExpiryStatus } from "../../types/datechecks";

export function ExpiryStatusBadge({ status }: { status: ExpiryStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${expiryStatusBadgeClass(status)}`}
    >
      {expiryStatusLabel(status)}
    </span>
  );
}
