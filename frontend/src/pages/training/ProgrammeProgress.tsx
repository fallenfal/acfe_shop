import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, UserPlus } from "lucide-react";
import {
  fetchOrgProgramme,
  fetchProgrammeEnrolments,
} from "../../api/training";
import { formatApiError } from "../../api/client";
import { AssignStaffModal } from "../../components/training/AssignStaffModal";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { useIsCmOrAbove } from "../../hooks/usePermission";
import { enrolmentStatusLabel } from "../../lib/trainingLabels";
import { formatDateTime } from "../../lib/format";
import type { Enrolment, EnrolmentStatus } from "../../types/training";

type SortKey = "name" | "status" | "progress" | "started";

export function ProgrammeProgress() {
  const { programmeId } = useParams<{ programmeId: string }>();
  const { locationId, locationRevision } = useLocation();
  const isCm = useIsCmOrAbove();

  const [programme, setProgramme] = useState<Awaited<
    ReturnType<typeof fetchOrgProgramme>
  > | null>(null);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EnrolmentStatus | "">("");
  const [sort, setSort] = useState<SortKey>("name");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Enrolment | null>(null);

  const load = useCallback(async () => {
    if (!programmeId || !locationId || locationId === ALL_LOCATIONS_ID) return;
    setLoading(true);
    setError(null);
    try {
      const [prog, enr] = await Promise.all([
        fetchOrgProgramme(programmeId),
        fetchProgrammeEnrolments(
          locationId,
          programmeId,
          statusFilter || undefined,
        ),
      ]);
      setProgramme(prog);
      setEnrolments(enr);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [programmeId, locationId, locationRevision, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const list = [...enrolments];
    list.sort((a, b) => {
      if (sort === "name") return a.user.name.localeCompare(b.user.name);
      if (sort === "status") return a.status.localeCompare(b.status);
      if (sort === "progress")
        return b.progress_percentage - a.progress_percentage;
      if (sort === "started") {
        const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
        const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
        return tb - ta;
      }
      return 0;
    });
    return list;
  }, [enrolments, sort]);

  const stats = programme?.stats;
  const completionRate =
    stats && stats.total_enrolments > 0
      ? Math.round((stats.completed_count / stats.total_enrolments) * 100)
      : 0;

  const enrolledIds = useMemo(
    () => new Set(enrolments.map((e) => e.user.id)),
    [enrolments],
  );

  if (!isCm) {
    return <p className="text-brown-600">You do not have access to this page.</p>;
  }

  if (!programmeId || !locationId || locationId === ALL_LOCATIONS_ID) {
    return <p className="text-brown-600">Select a location to view progress.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/training?tab=manage"
        className="inline-flex items-center gap-1 text-sm text-brown-600 hover:text-amber-brand-dark"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Training
      </Link>

      {loading && <p className="text-brown-600">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {programme && stats && (
        <>
          <header>
            <h1 className="font-display text-2xl font-bold text-brown-900">
              {programme.title}
            </h1>
            <p className="mt-1 text-brown-600">
              {stats.total_enrolments} enrolled · {completionRate}% completion rate
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["not_started", enrolments.filter((e) => e.status === "not_started").length],
                ["in_progress", stats.in_progress_count],
                ["completed", stats.completed_count],
              ] as const
            ).map(([label, count]) => (
              <div
                key={label}
                className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase text-brown-600">
                  {enrolmentStatusLabel(label)}
                </p>
                <p className="mt-1 font-display text-2xl font-bold text-brown-900">
                  {Math.max(0, count)}
                </p>
              </div>
            ))}
            <div className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-brown-600">
                Avg. completion
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-brown-900">
                {stats.average_completion_minutes != null
                  ? `${stats.average_completion_minutes}m`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(["", "not_started", "in_progress", "completed"] as const).map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    statusFilter === s
                      ? "bg-brown-800 text-white"
                      : "bg-cream-100 text-brown-700"
                  }`}
                >
                  {s === "" ? "All" : enrolmentStatusLabel(s)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-cream-200 px-3 py-1.5 text-sm"
              >
                <option value="name">Sort by name</option>
                <option value="status">Sort by status</option>
                <option value="progress">Sort by progress</option>
                <option value="started">Sort by started</option>
              </select>
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Assign Staff
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-cream-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-cream-200 bg-cream-50 text-brown-600">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Progress</th>
                  <th className="px-4 py-3 hidden md:table-cell">Step</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Started</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Completed</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b border-cream-100 hover:bg-cream-50 last:border-0"
                    onClick={() => setSelectedUser(e)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={e.user.name} src={e.user.avatar} size="sm" />
                        <span className="font-medium text-brown-900">
                          {e.user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs">
                        {enrolmentStatusLabel(e.status)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-cream-200">
                          <div
                            className="h-full bg-amber-brand"
                            style={{ width: `${e.progress_percentage}%` }}
                          />
                        </div>
                        <span className="text-xs">{e.progress_percentage}%</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {e.current_step}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell text-brown-600">
                      {e.started_at ? formatDateTime(e.started_at) : "—"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell text-brown-600">
                      {e.completed_at ? formatDateTime(e.completed_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="p-8 text-center text-brown-600">No enrolments yet.</p>
            )}
          </div>

          {selectedUser && (
            <div className="rounded-xl border border-cream-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-brown-900">
                  {selectedUser.user.name} — step detail
                </h3>
                <button
                  type="button"
                  className="text-sm text-brown-600 hover:underline"
                  onClick={() => setSelectedUser(null)}
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-sm text-brown-600">
                On step {selectedUser.current_step} of {programme.step_count} ·{" "}
                {selectedUser.progress_percentage}% complete
              </p>
              <Link
                to={`/training/${programmeId}`}
                className="mt-2 inline-block text-sm text-amber-brand-dark hover:underline"
              >
                Open programme timeline
              </Link>
            </div>
          )}
        </>
      )}

      <AssignStaffModal
        locationId={locationId}
        programmeId={programmeId}
        enrolledUserIds={enrolledIds}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssigned={load}
      />
    </div>
  );
}
