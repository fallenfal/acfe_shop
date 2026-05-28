import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import {
  archiveOrgProgramme,
  deleteOrgProgramme,
  enrolInProgramme,
  fetchLocationProgrammes,
  fetchOrgProgrammes,
  publishOrgProgramme,
} from "../../api/training";
import { formatApiError } from "../../api/client";
import { CategoryBadge } from "../../components/training/CategoryBadge";
import { ProgrammeCover } from "../../components/training/ProgrammeCover";
import { Button } from "../../components/ui/Button";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { useIsCmOrAbove, usePermission } from "../../hooks/usePermission";
import {
  TRAINING_CATEGORIES,
  categoryLabel,
  formatDuration,
} from "../../lib/trainingLabels";
import type {
  EnrolmentStatus,
  ProgrammeStatus,
  ProgrammeSummary,
  TrainingCategory,
} from "../../types/training";

type Tab = "mine" | "all" | "manage";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-xs text-brown-600">
        <span>
          {value}/{max} steps — {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cream-200">
        <div
          className="h-full rounded-full bg-amber-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EnrolledCard({
  programme,
  borderClass,
  actionLabel,
  onAction,
  collapsed,
  onToggle,
  showCompletedMeta,
}: {
  programme: ProgrammeSummary;
  borderClass: string;
  actionLabel: string;
  onAction: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  showCompletedMeta?: boolean;
}) {
  const e = programme.user_enrolment!;
  const completedSteps = Math.round(
    (e.progress_percentage / 100) * programme.step_count,
  );

  return (
    <article
      className={`overflow-hidden rounded-xl border border-cream-200 bg-white shadow-sm ${borderClass}`}
    >
      <ProgrammeCover
        coverImage={programme.cover_image}
        category={programme.category}
        title={programme.title}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-brown-900">{programme.title}</h3>
            <CategoryBadge category={programme.category} />
          </div>
          {showCompletedMeta && (
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 text-brown-600"
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
        {!collapsed && (
          <>
            {e.status !== "not_started" && programme.step_count > 0 && (
              <ProgressBar value={completedSteps} max={programme.step_count} />
            )}
            {showCompletedMeta && (
              <p className="mt-2 flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </p>
            )}
            <Button className="mt-4 w-full sm:w-auto" onClick={onAction}>
              {actionLabel}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

export function TrainingLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locationId, locationRevision } = useLocation();
  const isCm = useIsCmOrAbove();
  const canManage = usePermission("training.create");

  const tabParam = searchParams.get("tab") as Tab | null;
  const defaultTab: Tab = isCm ? "all" : "mine";
  const initialTab: Tab =
    tabParam === "manage" && !canManage
      ? defaultTab
      : tabParam === "mine" || tabParam === "all" || tabParam === "manage"
        ? tabParam
        : defaultTab;
  const [tab, setTab] = useState<Tab>(initialTab);

  const [programmes, setProgrammes] = useState<ProgrammeSummary[]>([]);
  const [manageProgrammes, setManageProgrammes] = useState<ProgrammeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | "">("");
  const [manageStatus, setManageStatus] = useState<ProgrammeStatus | "">("");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const setTabAndUrl = useCallback(
    (t: Tab) => {
      const next: Tab =
        t === "manage" && !canManage ? defaultTab : t;
      setTab(next);
      setSearchParams({ tab: next });
    },
    [setSearchParams, canManage, defaultTab],
  );

  useEffect(() => {
    if (tab === "manage" && !canManage) {
      setTab(defaultTab);
      setSearchParams({ tab: defaultTab });
    }
  }, [tab, canManage, defaultTab, setSearchParams]);

  const load = useCallback(async () => {
    if (!locationId || locationId === ALL_LOCATIONS_ID) return;
    setLoading(true);
    setError(null);
    try {
      const published = await fetchLocationProgrammes(locationId, {
        status: "published",
      });
      setProgrammes(published);
      if (canManage) {
        const orgList = await fetchOrgProgrammes(
          manageStatus ? { status: manageStatus } : {},
        );
        setManageProgrammes(orgList);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [locationId, locationRevision, canManage, manageStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const mandatoryOutstanding = useMemo(
    () =>
      programmes.filter(
        (p) =>
          p.is_mandatory &&
          (!p.user_enrolment || p.user_enrolment.status !== "completed"),
      ),
    [programmes],
  );

  const enrolled = useMemo(
    () => programmes.filter((p) => p.user_enrolment),
    [programmes],
  );

  const byStatus = useMemo(() => {
    const groups: Record<EnrolmentStatus, ProgrammeSummary[]> = {
      in_progress: [],
      not_started: [],
      completed: [],
    };
    for (const p of enrolled) {
      const s = p.user_enrolment!.status;
      groups[s].push(p);
    }
    return groups;
  }, [enrolled]);

  const filteredAll = useMemo(() => {
    let list = programmes;
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }
    return list;
  }, [programmes, categoryFilter, search]);

  const filteredManage = useMemo(() => {
    let list = manageProgrammes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }
    return list;
  }, [manageProgrammes, search]);

  function goToProgramme(programmeId: string, stepOrder?: number) {
    const path = `/training/${programmeId}`;
    navigate(stepOrder ? `${path}?step=${stepOrder}` : path);
  }

  async function handleEnrol(programmeId: string) {
    if (!locationId) return;
    setEnrollingId(programmeId);
    try {
      await enrolInProgramme(locationId, programmeId);
      await load();
      goToProgramme(programmeId);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setEnrollingId(null);
    }
  }

  async function handlePublish(id: string) {
    try {
      await publishOrgProgramme(id);
      load();
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this programme? Progress will be preserved.")) return;
    try {
      await archiveOrgProgramme(id);
      load();
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft programme?")) return;
    try {
      await deleteOrgProgramme(id);
      load();
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  if (!locationId || locationId === ALL_LOCATIONS_ID) {
    return (
      <p className="text-brown-600">
        Select a specific location to view training programmes.
      </p>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "mine", label: "My Training" },
    { id: "all", label: "All Programmes" },
  ];
  if (canManage) tabs.push({ id: "manage", label: "Manage" });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-amber-brand" aria-hidden />
          <h1 className="font-display text-2xl font-bold text-brown-900">Training</h1>
        </div>
        {canManage && tab === "manage" && (
          <Button onClick={() => navigate("/training/new")}>
            <Plus className="h-4 w-4" />
            Create New Programme
          </Button>
        )}
      </div>

      <div className="flex gap-1 rounded-lg border border-cream-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTabAndUrl(t.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-amber-brand/15 text-amber-brand-dark"
                : "text-brown-600 hover:bg-cream-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {tab === "mine" && mandatoryOutstanding.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-brand/30 bg-amber-brand/10 px-4 py-3">
          <div className="flex items-center gap-2 text-brown-900">
            <AlertCircle className="h-5 w-5 text-amber-brand" />
            <span className="text-sm font-medium">
              You have {mandatoryOutstanding.length} mandatory training programme
              {mandatoryOutstanding.length === 1 ? "" : "s"} to complete
            </span>
          </div>
          <Button variant="secondary" onClick={() => setTabAndUrl("all")}>
            View
          </Button>
        </div>
      )}

      {(tab === "all" || tab === "manage") && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-600" />
            <input
              type="search"
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-cream-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-amber-brand focus:outline-none focus:ring-1 focus:ring-amber-brand"
            />
          </div>
          {tab === "all" && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TrainingCategory | "")}
              className="rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {TRAINING_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {tab === "manage" && canManage && (
        <div className="flex flex-wrap gap-2">
          {(["", "draft", "published", "archived"] as const).map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => setManageStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                manageStatus === s
                  ? "bg-brown-800 text-white"
                  : "bg-cream-100 text-brown-700 hover:bg-cream-200"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-brown-600">Loading…</p>}

      {!loading && tab === "mine" && (
        <>
          {enrolled.length === 0 ? (
            <div className="rounded-xl border border-cream-200 bg-white p-10 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-cream-200" />
              <p className="mt-4 text-brown-700">
                No training assigned yet. Check out All Programmes to get started.
              </p>
              <Button className="mt-4" variant="secondary" onClick={() => setTabAndUrl("all")}>
                Browse programmes
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {byStatus.in_progress.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-amber-brand-dark">
                    In Progress
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {byStatus.in_progress.map((p) => (
                      <EnrolledCard
                        key={p.id}
                        programme={p}
                        borderClass="border-l-4 border-l-amber-500"
                        actionLabel="Continue"
                        onAction={() =>
                          goToProgramme(p.id, p.user_enrolment!.current_step)
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
              {byStatus.not_started.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-brown-600">
                    Not Started
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {byStatus.not_started.map((p) => (
                      <EnrolledCard
                        key={p.id}
                        programme={p}
                        borderClass=""
                        actionLabel="Start Training"
                        onAction={() => goToProgramme(p.id, 1)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {byStatus.completed.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setCompletedOpen((o) => !o)}
                    className="mb-3 flex w-full items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-green-700"
                  >
                    <span className="border-l-4 border-l-green-600 pl-2">Completed</span>
                    <span className="text-brown-600">({byStatus.completed.length})</span>
                    {completedOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {completedOpen && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {byStatus.completed.map((p) => (
                        <EnrolledCard
                          key={p.id}
                          programme={p}
                          borderClass="border-l-4 border-l-green-600"
                          actionLabel="Review"
                          onAction={() => goToProgramme(p.id)}
                          showCompletedMeta
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {!loading && tab === "all" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAll.map((p) => {
            const e = p.user_enrolment;
            const isDone = e?.status === "completed";
            const isEnrolled = Boolean(e);
            return (
              <article
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border border-cream-200 bg-white shadow-sm"
              >
                <ProgrammeCover
                  coverImage={p.cover_image}
                  category={p.category}
                  title={p.title}
                />
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display font-bold text-brown-900">{p.title}</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <CategoryBadge category={p.category} />
                    {p.is_mandatory && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-brown-600">
                    {p.step_count} steps · {formatDuration(p.estimated_duration_minutes)}
                  </p>
                  <div className="mt-auto pt-4">
                    {isDone ? (
                      <span className="text-sm font-medium text-green-700">Completed</span>
                    ) : isEnrolled ? (
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => goToProgramme(p.id)}
                      >
                        Enrolled — Continue
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={enrollingId === p.id}
                        onClick={() => handleEnrol(p.id)}
                      >
                        {enrollingId === p.id ? "Enrolling…" : "Enrol"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && tab === "manage" && canManage && (
        <div className="overflow-hidden rounded-xl border border-cream-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-cream-200 bg-cream-50 text-brown-600">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Category</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Steps</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Enrolled</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredManage.map((p) => (
                <tr key={p.id} className="border-b border-cream-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-brown-900">{p.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "published"
                          ? "bg-green-100 text-green-800"
                          : p.status === "draft"
                            ? "bg-cream-200 text-brown-700"
                            : "bg-brown-100 text-brown-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {categoryLabel(p.category)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{p.step_count}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {p.enrolment_count ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/training/${p.id}/edit`}
                        className="text-amber-brand-dark hover:underline"
                      >
                        Edit
                      </Link>
                      <Link
                        to={`/training/${p.id}/progress`}
                        className="text-brown-600 hover:underline"
                      >
                        Progress
                      </Link>
                      {p.status === "draft" && (
                        <button
                          type="button"
                          className="text-amber-brand-dark hover:underline"
                          onClick={() => handlePublish(p.id)}
                        >
                          Publish
                        </button>
                      )}
                      {p.status === "published" && (
                        <button
                          type="button"
                          className="text-brown-600 hover:underline"
                          onClick={() => handleArchive(p.id)}
                        >
                          Archive
                        </button>
                      )}
                      {p.status === "draft" && (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => handleDelete(p.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredManage.length === 0 && (
            <p className="p-8 text-center text-brown-600">No programmes found.</p>
          )}
        </div>
      )}
    </div>
  );
}
