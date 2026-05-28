import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { assignProgramme, fetchAssignableUsers } from "../../api/training";
import { formatApiError } from "../../api/client";
import type { AssignableUser } from "../../types/training";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

export function AssignStaffModal({
  locationId,
  programmeId,
  enrolledUserIds,
  open,
  onClose,
  onAssigned,
}: {
  locationId: string;
  programmeId: string;
  enrolledUserIds: Set<string>;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    fetchAssignableUsers(locationId)
      .then(setUsers)
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [open, locationId]);

  if (!open) return null;

  const available = users.filter((u) => !enrolledUserIds.has(u.id));

  async function handleAssign() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await assignProgramme(locationId, programmeId, Array.from(selected));
      onAssigned();
      onClose();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brown-900/40 p-4 sm:items-center">
      <div
        className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-labelledby="assign-staff-title"
      >
        <div className="flex items-center justify-between border-b border-cream-200 px-4 py-3">
          <h2 id="assign-staff-title" className="font-display text-lg font-bold text-brown-900">
            Assign staff
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-brown-600 hover:bg-cream-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto px-4 py-3">
          {loading && <p className="text-sm text-brown-600">Loading staff…</p>}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {!loading && available.length === 0 && (
            <p className="text-sm text-brown-600">
              Everyone at this location is already enrolled.
            </p>
          )}
          <ul className="space-y-2">
            {available.map((user) => (
              <li key={user.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-cream-200 p-3 hover:bg-cream-50">
                  <input
                    type="checkbox"
                    checked={selected.has(user.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(user.id);
                        else next.delete(user.id);
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-cream-200 text-amber-brand focus:ring-amber-brand"
                  />
                  <Avatar name={user.name} src={user.avatar} size="sm" />
                  <span className="text-sm font-medium text-brown-900">{user.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-cream-200 px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? "Assigning…" : `Assign (${selected.size})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
