import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  fetchDateCheckSchedule,
  updateDateCheckSchedule,
} from "../../api/datechecks";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { scheduleFrequencyLabel } from "../../lib/datecheckLabels";
import { canManageDateCheckSchedule } from "../../lib/permissions";
import type { DateCheckSchedule, ScheduleFrequency } from "../../types/datechecks";

const FREQUENCIES: ScheduleFrequency[] = [
  "daily",
  "every_other_day",
  "twice_weekly",
  "weekly",
];

const inputClass =
  "mt-1 w-full min-h-[48px] rounded-lg border border-cream-200 bg-white px-4 py-3 text-brown-900 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20";

export function DateCheckSettings() {
  const { user } = useAuth();
  const { locationId, locationRevision, currentRole } = useLocation();
  const canManage =
    user && locationId
      ? canManageDateCheckSchedule(user, locationId, currentRole)
      : false;

  const [schedule, setSchedule] = useState<DateCheckSchedule | null>(null);
  const [frequency, setFrequency] = useState<ScheduleFrequency>("daily");
  const [threshold, setThreshold] = useState(3);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const data = await fetchDateCheckSchedule(locationId);
      setSchedule(data);
      setFrequency(data.frequency);
      setThreshold(data.alert_threshold_days);
      setReminderEnabled(data.reminder_enabled);
      setReminderTime(data.reminder_time.slice(0, 5));
    } catch {
      setError("Could not load schedule.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load, locationRevision]);

  if (user && locationId && !canManage) {
    return <Navigate to="/date-checks" replace />;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateDateCheckSchedule(locationId, {
        frequency,
        alert_threshold_days: threshold,
        reminder_enabled: reminderEnabled,
        reminder_time: reminderTime,
      });
      setSchedule(updated);
      setSaved(true);
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        to="/date-checks"
        className="inline-flex items-center gap-1 text-sm text-amber-brand-dark hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to date checks
      </Link>

      <h1 className="font-display text-2xl font-bold text-brown-900">
        Date check schedule
      </h1>
      <p className="text-sm text-brown-600">
        Configure how often checks should run and when to raise expiry alerts.
        {schedule?.location_name && (
          <> For <strong>{schedule.location_name}</strong>.</>
        )}
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}
      {saved && (
        <p className="rounded-lg bg-[#639922]/10 px-4 py-3 text-sm text-[#4a7319]">
          Settings saved.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-brown-600">Loading…</p>
      ) : (
        <form
          onSubmit={handleSave}
          className="space-y-6 rounded-xl border border-cream-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-brown-800">
            Check frequency
            <select
              className={inputClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {scheduleFrequencyLabel(f)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label className="block text-sm font-medium text-brown-800">
              Alert threshold: {threshold} day{threshold === 1 ? "" : "s"}
            </label>
            <p className="text-xs text-brown-600">
              Alert me about products expiring within this many days
            </p>
            <input
              type="range"
              min={1}
              max={14}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
              className="mt-3 w-full accent-amber-brand"
            />
            <div className="mt-1 flex justify-between text-xs text-brown-500">
              <span>1 day</span>
              <span>14 days</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="h-5 w-5 rounded border-cream-300 text-amber-brand focus:ring-amber-brand"
              />
              <span className="text-sm font-medium text-brown-800">
                Send reminder if no check done by the chosen time
              </span>
            </label>
            {reminderEnabled && (
              <label className="block text-sm font-medium text-brown-800">
                Reminder time
                <input
                  type="time"
                  className={inputClass}
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                />
              </label>
            )}
          </div>

          <Button type="submit" className="w-full min-h-[52px]" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </form>
      )}
    </div>
  );
}
