import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteWasteEntry, fetchAllWaste } from "../../api/waste";
import { WasteEntryRow } from "../../components/waste/WasteEntryRow";
import { WasteLogForm } from "../../components/waste/WasteLogForm";
import { WasteReports } from "../../components/waste/WasteReports";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { formatCurrency } from "../../lib/format";
import { todayDateParam } from "../../lib/wasteLabels";
import { hasPermissionAtLocation } from "../../lib/permissions";
import type { WasteEntry } from "../../types/waste";

type Tab = "log" | "reports";

export function WasteLog() {
  const { user } = useAuth();
  const { locationId } = useLocation();
  const [tab, setTab] = useState<Tab>("log");
  const [todayEntries, setTodayEntries] = useState<WasteEntry[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRead =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "waste.read")
      : false;
  const canCreate =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "waste.create")
      : false;
  const canReports =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "waste.view_reports")
      : false;

  const loadToday = useCallback(async () => {
    if (!locationId) return;
    setLoadingToday(true);
    setError(null);
    try {
      const today = todayDateParam();
      const entries = await fetchAllWaste(locationId, {
        date_from: today,
        date_to: today,
      });
      setTodayEntries(entries);
    } catch {
      setError("Could not load today's waste entries.");
    } finally {
      setLoadingToday(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (tab === "log") loadToday();
  }, [tab, loadToday]);

  const todayTotals = useMemo(() => {
    const count = todayEntries.length;
    const cost = todayEntries.reduce(
      (sum, e) => sum + parseFloat(e.cost_value || "0"),
      0,
    );
    return { count, cost };
  }, [todayEntries]);

  async function handleDelete(id: string) {
    if (!locationId || !window.confirm("Delete this waste entry?")) return;
    setDeletingId(id);
    try {
      await deleteWasteEntry(locationId, id);
      await loadToday();
    } catch {
      setError("Could not delete entry.");
    } finally {
      setDeletingId(null);
    }
  }

  if (user && locationId && !canRead) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        You do not have permission to view waste at this location.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-brown-900">
          Waste tracking
        </h1>
      </div>

      <div className="flex rounded-xl border border-cream-200 bg-cream-50 p-1">
        <button
          type="button"
          onClick={() => setTab("log")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "log"
              ? "bg-white text-red-800 shadow-sm"
              : "text-brown-600 hover:text-brown-900"
          }`}
        >
          Log waste
        </button>
        <button
          type="button"
          onClick={() => setTab("reports")}
          disabled={!canReports}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tab === "reports"
              ? "bg-white text-red-800 shadow-sm"
              : "text-brown-600 hover:text-brown-900"
          }`}
        >
          Reports
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {tab === "log" && (
        <div className="space-y-6">
          {canCreate ? (
            <WasteLogForm onSuccess={loadToday} />
          ) : (
            <p className="rounded-xl border border-cream-200 bg-white p-4 text-sm text-brown-600">
              You do not have permission to log waste.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                Today&apos;s items wasted
              </p>
              <p className="mt-1 font-display text-3xl font-bold text-amber-950">
                {todayTotals.count}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-900/80">
                Today&apos;s total cost
              </p>
              <p className="mt-1 font-display text-3xl font-bold text-red-800">
                {formatCurrency(todayTotals.cost)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-cream-200 bg-white shadow-sm">
            <h2 className="border-b border-cream-200 px-4 py-3 font-display text-lg font-bold text-brown-900">
              Today&apos;s entries
            </h2>
            {loadingToday ? (
              <p className="px-4 py-8 text-center text-sm text-brown-600">Loading…</p>
            ) : todayEntries.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-brown-600">
                No waste logged today yet.
              </p>
            ) : (
              <ul>
                {todayEntries.map((entry) => (
                  <WasteEntryRow
                    key={entry.id}
                    entry={entry}
                    user={user}
                    locationId={locationId}
                    onDelete={handleDelete}
                    deleting={deletingId === entry.id}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "reports" && (
        canReports ? (
          <WasteReports />
        ) : (
          <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
            You do not have permission to view waste reports.
          </p>
        )
      )}
    </div>
  );
}
