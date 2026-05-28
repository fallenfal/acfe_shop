import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import {
  fetchDateCheckScheduleStatus,
  fetchExpiryAlertSummary,
} from "../../api/datechecks";
import { EXPIRY_COLORS } from "../../lib/datecheckLabels";
import type { ExpiryAlertSummary } from "../../types/datechecks";

function isCheckDoneToday(lastCheckAt: string | null): boolean {
  if (!lastCheckAt) return false;
  const checkDate = new Date(lastCheckAt);
  const today = new Date();
  return (
    checkDate.getFullYear() === today.getFullYear() &&
    checkDate.getMonth() === today.getMonth() &&
    checkDate.getDate() === today.getDate()
  );
}

export function ExpiryAlertsWidget({ locationId }: { locationId: string }) {
  const [summary, setSummary] = useState<ExpiryAlertSummary | null>(null);
  const [isOverdue, setIsOverdue] = useState(false);
  const [doneToday, setDoneToday] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchExpiryAlertSummary(locationId).catch(() => null),
      fetchDateCheckScheduleStatus(locationId).catch(() => null),
    ]).then(([alertSummary, schedule]) => {
      if (cancelled) return;
      setSummary(alertSummary);
      setIsOverdue(schedule?.is_overdue ?? false);
      setDoneToday(
        schedule ? !schedule.is_overdue && isCheckDoneToday(schedule.last_check_at) : false,
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-brown-600">Loading expiry alerts…</p>
      </div>
    );
  }

  const levels = [
    { key: "expired" as const, count: summary?.expired ?? 0, color: EXPIRY_COLORS.expired },
    { key: "critical" as const, count: summary?.critical ?? 0, color: EXPIRY_COLORS.critical },
    { key: "warning" as const, count: summary?.warning ?? 0, color: EXPIRY_COLORS.warning },
  ];

  return (
    <Link
      to="/date-checks"
      className="block rounded-xl border border-cream-200 bg-white p-4 shadow-sm transition-colors hover:border-amber-brand/40 hover:bg-cream-50/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-amber-brand-dark" aria-hidden />
          <h3 className="text-sm font-semibold text-brown-900">Expiry alerts</h3>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {levels.map(({ key, count, color }) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-xs text-brown-700">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="font-medium">{count}</span>
            <span className="capitalize text-brown-600">{key}</span>
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs font-medium text-brown-800">
        {doneToday ? (
          <span className="text-[#639922]">Date check: ✓ Done today</span>
        ) : isOverdue ? (
          <span className="text-[#E24B4A]">Date check: ⚠ Overdue</span>
        ) : (
          <span className="text-brown-600">Date check: due</span>
        )}
      </p>
    </Link>
  );
}
