import { Trash2 } from "lucide-react";
import { formatCurrency, formatRelativeTime } from "../../lib/format";
import {
  wasteEntryItemName,
  wasteShiftLabel,
} from "../../lib/wasteLabels";
import { canDeleteWasteEntry } from "../../lib/wastePermissions";
import type { User } from "../../types/user";
import type { WasteEntry } from "../../types/waste";
import { WasteReasonBadge } from "./WasteReasonBadge";

export function WasteEntryRow({
  entry,
  user,
  locationId,
  onDelete,
  deleting,
}: {
  entry: WasteEntry;
  user: User | null;
  locationId: string | null;
  onDelete: (id: string) => void;
  deleting?: boolean;
}) {
  const canDelete = canDeleteWasteEntry(user, locationId, entry.logged_at);

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-cream-100 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-brown-900">{wasteEntryItemName(entry)}</p>
        <p className="text-sm text-brown-600">
          {entry.quantity} {entry.unit}
          <span className="mx-1.5 text-cream-200">·</span>
          {wasteShiftLabel(entry.shift)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <WasteReasonBadge reason={entry.reason} />
          <span className="text-xs font-semibold text-red-700">
            {formatCurrency(entry.cost_value)}
          </span>
        </div>
        <p className="mt-1 text-xs text-brown-600">
          {entry.logged_by_name ?? "Unknown"}
          <span className="mx-1">·</span>
          {formatRelativeTime(entry.logged_at)}
        </p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
          title="Delete entry (within 24h)"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
