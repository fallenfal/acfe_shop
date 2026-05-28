import { wasteReasonLabel, wasteReasonStyle } from "../../lib/wasteLabels";
import type { WasteReason } from "../../types/waste";

export function WasteReasonBadge({ reason }: { reason: WasteReason | string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${wasteReasonStyle(reason)}`}
    >
      {wasteReasonLabel(reason)}
    </span>
  );
}
