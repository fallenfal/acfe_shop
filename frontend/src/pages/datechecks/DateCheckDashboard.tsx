import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  PoundSterling,
  Plus,
} from "lucide-react";
import {
  bulkResolveExpiryAlerts,
  fetchAllDateChecks,
  fetchAllExpiryAlerts,
  fetchDateCheckScheduleStatus,
  fetchExpiryAlertSummary,
  resolveExpiryAlert,
} from "../../api/datechecks";
import { AlertResolveDropdown } from "../../components/datechecks/AlertResolveDropdown";
import { Button } from "../../components/ui/Button";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  alertLevelSectionClass,
  daysUntilExpiryLabel,
  expectedChecksPerWeek,
  startOfWeekIso,
} from "../../lib/datecheckLabels";
import { formatCurrency, formatDateTime, formatRelativeTime } from "../../lib/format";
import {
  canCreateDateCheck,
  canReadDateChecks,
  canResolveExpiryAlerts,
  canManageDateCheckSchedule,
} from "../../lib/permissions";
import type {
  DateCheckSummary,
  ExpiryAlert,
  ExpiryAlertSummary,
  DateCheckScheduleStatus,
} from "../../types/datechecks";

function AlertSection({
  level,
  title,
  alerts,
  canResolve,
  onResolve,
  onBulkResolve,
}: {
  level: "expired" | "critical" | "warning";
  title: string;
  alerts: ExpiryAlert[];
  canResolve: boolean;
  onResolve: (id: string, resolution: string) => void;
  onBulkResolve?: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <section
      className={`rounded-xl border p-4 ${alertLevelSectionClass(level)}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-brown-900">{title}</h3>
        {level === "expired" && onBulkResolve && canResolve && (
          <Button variant="danger" onClick={onBulkResolve} className="text-xs">
            Resolve all expired
          </Button>
        )}
      </div>
      <ul className="space-y-3">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-col gap-2 rounded-lg border border-cream-200/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-brown-900">{alert.product_name}</p>
              <p className="text-sm text-brown-600">
                Expires {alert.expiry_date} ·{" "}
                {daysUntilExpiryLabel(alert.days_until_expiry)} ·{" "}
                {alert.quantity_at_risk} {alert.quantity_at_risk === 1 ? "unit" : "units"}
              </p>
              <p className="text-sm font-medium text-brown-800">
                {formatCurrency(alert.estimated_cost)}
              </p>
            </div>
            {canResolve && (
              <AlertResolveDropdown
                onResolve={(resolution) => onResolve(alert.id, resolution)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DateCheckDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { locationId, locationRevision, currentRole } = useLocation();
  const canRead =
    user && locationId && locationId !== ALL_LOCATIONS_ID
      ? canReadDateChecks(user, locationId, currentRole)
      : false;
  const canCreate =
    user && locationId
      ? canCreateDateCheck(user, locationId, currentRole)
      : false;
  const canResolve =
    user && locationId
      ? canResolveExpiryAlerts(user, locationId, currentRole)
      : false;
  const canManageSchedule =
    user && locationId
      ? canManageDateCheckSchedule(user, locationId, currentRole)
      : false;

  const [checks, setChecks] = useState<DateCheckSummary[]>([]);
  const [alerts, setAlerts] = useState<ExpiryAlert[]>([]);
  const [summary, setSummary] = useState<ExpiryAlertSummary | null>(null);
  const [scheduleStatus, setScheduleStatus] =
    useState<DateCheckScheduleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    if (!locationId || locationId === ALL_LOCATIONS_ID) return;
    setLoading(true);
    setError(null);
    try {
      const weekStart = startOfWeekIso();
      const [checkList, alertList, alertSummary, status] = await Promise.all([
        fetchAllDateChecks(locationId, { date_from: weekStart }),
        fetchAllExpiryAlerts(locationId, { resolution: "pending" }),
        fetchExpiryAlertSummary(locationId),
        fetchDateCheckScheduleStatus(locationId),
      ]);
      setChecks(checkList);
      setAlerts(alertList);
      setSummary(alertSummary);
      setScheduleStatus(status);
    } catch {
      setError("Could not load date check data.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load, locationRevision]);

  const recentChecks = useMemo(
    () => [...checks].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [checks],
  );

  const alertsByLevel = useMemo(
    () => ({
      expired: alerts.filter((a) => a.alert_level === "expired"),
      critical: alerts.filter((a) => a.alert_level === "critical"),
      warning: alerts.filter((a) => a.alert_level === "warning"),
    }),
    [alerts],
  );

  const completedThisWeek = useMemo(
    () =>
      checks.filter((c) => c.status === "completed").length,
    [checks],
  );

  const expectedWeek = scheduleStatus
    ? expectedChecksPerWeek(scheduleStatus.frequency)
    : 7;

  const totalCost = summary?.total_cost_at_risk ?? 0;
  async function handleResolve(alertId: string, resolution: string) {
    if (!locationId) return;
    setResolving(true);
    try {
      await resolveExpiryAlert(locationId, alertId, { resolution });
      await load();
    } catch {
      setError("Could not resolve alert.");
    } finally {
      setResolving(false);
    }
  }

  async function handleBulkResolveExpired() {
    if (!locationId || alertsByLevel.expired.length === 0) return;
    setResolving(true);
    try {
      await bulkResolveExpiryAlerts(locationId, {
        alert_ids: alertsByLevel.expired.map((a) => a.id),
        resolution: "disposed",
        resolved_note: "Bulk resolved from dashboard",
      });
      await load();
    } catch {
      setError("Could not resolve alerts.");
    } finally {
      setResolving(false);
    }
  }

  function scrollToAlerts() {
    document.getElementById("active-alerts")?.scrollIntoView({ behavior: "smooth" });
  }

  if (authLoading) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        Loading…
      </p>
    );
  }

  if (!locationId || locationId === ALL_LOCATIONS_ID) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        Select a specific location to view date checks.
      </p>
    );
  }

  if (user && !canRead) {
    return (
      <p className="rounded-xl border border-cream-200 bg-white p-6 text-sm text-brown-600">
        You do not have permission to view date checks at this location.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brown-900">
            Date Checks
          </h1>
          <p className="mt-1 text-sm text-brown-600">
            Track expiry dates and resolve alerts before stock goes to waste.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/date-checks/new")} className="min-h-[48px]">
            <Plus className="h-5 w-5" aria-hidden />
            Start new check
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {/* Section A — banners */}
      {summary && (summary.expired > 0 || summary.critical > 0 || summary.warning > 0) && (
        <button
          type="button"
          onClick={scrollToAlerts}
          className={`w-full rounded-xl border-2 p-4 text-left transition hover:opacity-95 ${
            summary.expired > 0
              ? "border-[#E24B4A] bg-[#E24B4A]/10"
              : summary.critical > 0
                ? "border-[#D85A30] bg-[#D85A30]/10"
                : "border-[#EF9F27] bg-[#EF9F27]/10"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold text-brown-900">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            {summary.expired > 0 &&
              `⚠ ${summary.expired} expired item${summary.expired === 1 ? "" : "s"} need immediate action`}
            {summary.expired === 0 && summary.critical > 0 &&
              `${summary.critical} item${summary.critical === 1 ? "" : "s"} expire today/tomorrow`}
            {summary.expired === 0 &&
              summary.critical === 0 &&
              summary.warning > 0 &&
              `${summary.warning} item${summary.warning === 1 ? "" : "s"} expiring within 3 days`}
          </p>
          <p className="mt-1 text-sm text-brown-700">Tap to view alerts →</p>
        </button>
      )}

      {scheduleStatus?.is_overdue && (
        <div className="rounded-xl border border-amber-brand/40 bg-amber-brand/10 px-4 py-3 text-sm text-brown-800">
          <strong>Date check overdue</strong>
          {scheduleStatus.hours_since_last_check != null
            ? ` — last check was ${scheduleStatus.hours_since_last_check} hours ago`
            : " — no check recorded yet"}
        </div>
      )}

      {/* Section B — stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
            Active alerts
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-brown-900">
            {alerts.length}
          </p>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#E24B4A]" />
              {summary?.expired ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#D85A30]" />
              {summary?.critical ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#EF9F27]" />
              {summary?.warning ?? 0}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
            Cost at risk
          </p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-bold text-brown-900">
            <PoundSterling className="h-5 w-5 text-amber-brand" aria-hidden />
            {formatCurrency(totalCost)}
          </p>
        </div>
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
            Last check
          </p>
          <p
            className={`mt-1 flex items-center gap-2 font-display text-lg font-bold ${
              scheduleStatus?.is_overdue ? "text-[#E24B4A]" : "text-[#639922]"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                scheduleStatus?.is_overdue ? "bg-[#E24B4A]" : "bg-[#639922]"
              }`}
            />
            {scheduleStatus?.last_check_at
              ? formatRelativeTime(scheduleStatus.last_check_at)
              : "Never"}
          </p>
          {scheduleStatus?.last_check_at && (
            <p className="text-xs text-brown-600">
              {formatDateTime(scheduleStatus.last_check_at)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
            This week
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-brown-900">
            {completedThisWeek}/{expectedWeek}
          </p>
          <p className="text-xs text-brown-600">checks completed</p>
        </div>
      </div>

      {/* Section C — two columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-display text-lg font-bold text-brown-900">
            Recent date checks
          </h2>
          {loading ? (
            <p className="text-sm text-brown-600">Loading…</p>
          ) : recentChecks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-cream-200 bg-white p-6 text-center text-sm text-brown-600">
              No date checks yet. Start your first check.
            </p>
          ) : (
            <ul className="space-y-3">
              {recentChecks.slice(0, 15).map((check) => (
                <li key={check.id}>
                  {check.status === "completed" ? (
                    <Link
                      to={`/date-checks/${check.id}`}
                      className="block rounded-xl border border-cream-200 bg-white p-4 shadow-sm transition hover:border-amber-brand/40"
                    >
                      <CheckCard check={check} />
                    </Link>
                  ) : (
                    <div className="rounded-xl border border-amber-brand/30 bg-amber-brand/5 p-4">
                      <CheckCard check={check} />
                      {canCreate && (
                        <Button
                          className="mt-3 w-full"
                          onClick={() =>
                            navigate(`/date-checks/new?checkId=${check.id}`)
                          }
                        >
                          Continue check
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="active-alerts" className="space-y-4 scroll-mt-24">
          <h2 className="font-display text-lg font-bold text-brown-900">
            Active expiry alerts
          </h2>
          {alerts.length === 0 && !loading ? (
            <div className="flex flex-col items-center rounded-xl border border-[#639922]/30 bg-[#639922]/5 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[#639922]" aria-hidden />
              <p className="mt-3 font-medium text-brown-900">
                No active alerts — all clear!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AlertSection
                level="expired"
                title={`Expired (${alertsByLevel.expired.length})`}
                alerts={alertsByLevel.expired}
                canResolve={canResolve}
                onResolve={handleResolve}
                onBulkResolve={handleBulkResolveExpired}
              />
              <AlertSection
                level="critical"
                title={`Critical (${alertsByLevel.critical.length})`}
                alerts={alertsByLevel.critical}
                canResolve={canResolve}
                onResolve={handleResolve}
              />
              <AlertSection
                level="warning"
                title={`Warning (${alertsByLevel.warning.length})`}
                alerts={alertsByLevel.warning}
                canResolve={canResolve}
                onResolve={handleResolve}
              />
            </div>
          )}
          {resolving && (
            <p className="text-sm text-brown-600">Updating alerts…</p>
          )}
        </section>
      </div>

      {canManageSchedule && (
        <div className="flex justify-end">
          <Link
            to="/date-checks/settings"
            className="text-sm text-amber-brand-dark hover:underline"
          >
            Schedule settings →
          </Link>
        </div>
      )}
    </div>
  );
}

function CheckCard({ check }: { check: DateCheckSummary }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-brown-600">
          <CalendarCheck className="h-4 w-4" aria-hidden />
          {formatDateTime(check.started_at)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            check.status === "completed"
              ? "bg-[#639922]/15 text-[#4a7319]"
              : "bg-amber-brand/15 text-amber-brand-dark"
          }`}
        >
          {check.status === "completed" ? "Completed" : "In progress"}
        </span>
      </div>
      <p className="mt-1 text-sm text-brown-700">
        {check.conducted_by_name ?? "Unknown"} · Checked {check.items_checked} items
        — {check.items_expired} expired, {check.items_expiring_soon} expiring soon
      </p>
    </>
  );
}
