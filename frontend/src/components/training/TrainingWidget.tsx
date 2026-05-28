import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { fetchTrainingDashboardSummary } from "../../api/training";
import type { TrainingDashboardSummary } from "../../types/training";

export function TrainingWidget({ locationId }: { locationId: string }) {
  const [summary, setSummary] = useState<TrainingDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrainingDashboardSummary(locationId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-brown-600">Loading training…</p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <Link
      to="/training"
      className="block rounded-xl border border-cream-200 bg-white p-4 shadow-sm transition-colors hover:border-amber-brand/40 hover:bg-cream-50/50"
    >
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-amber-brand-dark" aria-hidden />
        <h3 className="text-sm font-semibold text-brown-900">Training</h3>
      </div>

      <p className="mt-3 text-2xl font-bold text-amber-brand-dark">
        {summary.completion_rate}%
      </p>
      <p className="text-xs text-brown-600">Mandatory completion rate</p>

      <ul className="mt-3 space-y-1 text-xs text-brown-700">
        <li>
          <span className="font-semibold text-green-800">
            {summary.fully_trained}
          </span>{" "}
          staff fully trained
        </li>
        <li>
          <span className="font-semibold text-amber-700">
            {summary.in_progress}
          </span>{" "}
          in progress
        </li>
        <li>
          <span className="font-semibold text-red-700">
            {summary.not_started}
          </span>{" "}
          not started
        </li>
      </ul>
    </Link>
  );
}
