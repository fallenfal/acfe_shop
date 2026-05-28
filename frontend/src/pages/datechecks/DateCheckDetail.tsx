import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Download } from "lucide-react";
import { fetchDateCheck } from "../../api/datechecks";
import { ExpiryStatusBadge } from "../../components/datechecks/ExpiryStatusBadge";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { entryActionLabel } from "../../lib/datecheckLabels";
import { exportDateCheckCsv } from "../../lib/exportDateCheckCsv";
import { formatCurrency, formatDateTime } from "../../lib/format";
import { canReadDateChecks } from "../../lib/permissions";
import type { DateCheckDetail as DateCheckDetailType, DateCheckEntry } from "../../types/datechecks";

function durationLabel(started: string, completed: string | null) {
  if (!completed) return "—";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function EntryRow({ entry }: { entry: DateCheckEntry }) {
  const [open, setOpen] = useState(false);
  const hasExtra = Boolean(entry.photo || entry.action_note);

  return (
    <>
      <tr className="border-b border-cream-100 hover:bg-cream-50/50">
        <td className="px-4 py-3 font-medium text-brown-900">{entry.product_name}</td>
        <td className="px-4 py-3 text-brown-700">{entry.earliest_expiry}</td>
        <td className="px-4 py-3">
          <ExpiryStatusBadge status={entry.expiry_status} />
        </td>
        <td className="px-4 py-3 text-brown-700">
          {entry.quantity_at_risk} {entry.unit}
        </td>
        <td className="px-4 py-3 text-brown-700">
          {formatCurrency(entry.estimated_cost)}
        </td>
        <td className="px-4 py-3 text-brown-700">
          {entryActionLabel(entry.action_taken)}
        </td>
        <td className="px-4 py-3">
          {hasExtra && (
            <button
              type="button"
              className="rounded p-1 text-brown-600 hover:bg-cream-100"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </td>
      </tr>
      {open && hasExtra && (
        <tr className="bg-cream-50">
          <td colSpan={7} className="px-4 py-3 text-sm text-brown-700">
            {entry.action_note && <p>Notes: {entry.action_note}</p>}
            {entry.photo && (
              <a
                href={entry.photo}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-amber-brand-dark hover:underline"
              >
                View photo
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function DateCheckDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { locationId, locationRevision, currentRole } = useLocation();
  const canRead =
    user && locationId
      ? canReadDateChecks(user, locationId, currentRole)
      : false;

  const [check, setCheck] = useState<DateCheckDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId || !id) return;
    setLoading(true);
    try {
      const data = await fetchDateCheck(locationId, id);
      setCheck(data);
    } catch {
      setError("Could not load date check.");
    } finally {
      setLoading(false);
    }
  }, [locationId, id]);

  useEffect(() => {
    load();
  }, [load, locationRevision]);

  const costAtRisk = check?.entries.reduce(
    (sum, e) => sum + parseFloat(e.estimated_cost || "0"),
    0,
  );

  if (authLoading) {
    return <p className="text-sm text-brown-600">Loading…</p>;
  }

  if (user && locationId && !canRead) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        You do not have permission to view this date check.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-brown-600">Loading…</p>;
  }

  if (error || !check) {
    return (
      <div className="space-y-4">
        <Link
          to="/date-checks"
          className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
        <p className="text-red-700">{error ?? "Not found"}</p>
      </div>
    );
  }

  const sortedEntries = [...check.entries].sort(
    (a, b) =>
      new Date(a.earliest_expiry).getTime() - new Date(b.earliest_expiry).getTime(),
  );

  return (
    <div className="space-y-6">
      <Link
        to="/date-checks"
        className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to date checks
      </Link>

      <header className="rounded-xl border border-cream-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-brown-900">
              Date check — {formatDateTime(check.started_at)}
            </h1>
            <p className="mt-1 text-sm text-brown-600">
              {check.conducted_by_name ?? "Unknown"} · Duration:{" "}
              {durationLabel(check.started_at, check.completed_at)}
            </p>
            {check.notes && (
              <p className="mt-2 text-sm text-brown-700">{check.notes}</p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              exportDateCheckCsv(
                check,
                `date-check-${check.started_at.slice(0, 10)}.csv`,
              )
            }
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items checked" value={String(check.items_checked)} />
        <StatCard label="Expired found" value={String(check.items_expired)} accent="expired" />
        <StatCard
          label="Expiring soon"
          value={String(check.items_expiring_soon)}
          accent="warning"
        />
        <StatCard
          label="Cost at risk"
          value={formatCurrency(costAtRisk ?? 0)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-cream-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-cream-200 bg-cream-50 text-xs uppercase tracking-wide text-brown-600">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "expired" | "warning";
}) {
  const accentClass =
    accent === "expired"
      ? "text-[#E24B4A]"
      : accent === "warning"
        ? "text-[#EF9F27]"
        : "text-brown-900";
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${accentClass}`}>{value}</p>
    </div>
  );
}
