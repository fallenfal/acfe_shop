import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  PartyPopper,
} from "lucide-react";
import {
  completeTrainingStep,
  createTrainingComment,
  enrolInProgramme,
  fetchOrgProgramme,
  fetchTrainingComments,
  fetchTrainingProgress,
} from "../../api/training";
import { formatApiError } from "../../api/client";
import { MarkdownBody } from "../../components/memos/MarkdownBody";
import { CategoryBadge } from "../../components/training/CategoryBadge";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { usePermission } from "../../hooks/usePermission";
import { formatDuration } from "../../lib/trainingLabels";
import { formatDateTime, formatRelativeTime } from "../../lib/format";
import type { TrainingComment, TrainingProgress, TrainingStep } from "../../types/training";

type StepState = "completed" | "current" | "future";

function getStepState(
  step: TrainingStep,
  completedOrders: Set<number>,
): StepState {
  if (completedOrders.has(step.order)) return "completed";
  const nextOrder = completedOrders.size > 0 ? Math.max(...completedOrders) + 1 : 1;
  if (step.order === nextOrder) return "current";
  return "future";
}

function StepTimelineCard({
  step,
  state,
  completionNotes,
  completedAt,
  previewMode,
  onComplete,
  completing,
}: {
  step: TrainingStep;
  state: StepState;
  completionNotes?: string;
  completedAt?: string;
  previewMode?: boolean;
  onComplete?: (acknowledged: boolean, notes: string) => void;
  completing?: boolean;
}) {
  const [expanded, setExpanded] = useState(state === "current");
  const [peek, setPeek] = useState(false);
  const [ack, setAck] = useState(false);
  const [notes, setNotes] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  useEffect(() => {
    if (state === "current") setExpanded(true);
  }, [state]);

  const showContent = expanded || peek;
  const canComplete = state === "current" && !previewMode;

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      <div className="flex flex-col items-center">
        <div
          className={`relative z-10 flex shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
            state === "completed"
              ? "h-10 w-10 bg-green-600 text-white"
              : state === "current"
                ? "h-12 w-12 bg-amber-brand text-white ring-4 ring-amber-brand/25 animate-pulse"
                : "h-8 w-8 border-2 border-cream-200 bg-white"
          }`}
        >
          {state === "completed" ? (
            <Check className="h-5 w-5" strokeWidth={3} />
          ) : (
            <span
              className={`text-xs font-bold ${state === "current" ? "text-white" : "text-brown-600"}`}
            >
              {step.order}
            </span>
          )}
        </div>
      </div>

      <div
        className={`min-w-0 flex-1 rounded-xl border bg-white transition-all duration-300 ${
          state === "current"
            ? "border-amber-brand/40 shadow-md ring-1 ring-amber-brand/20"
            : state === "completed"
              ? "border-cream-200"
              : "border-cream-200 opacity-80"
        }`}
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 p-4 text-left"
          onClick={() => {
            if (state === "future") setPeek((p) => !p);
            else setExpanded((e) => !e);
          }}
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-brown-600">
              Step {step.order}
            </p>
            <h3 className="font-display text-lg font-bold text-brown-900">{step.title}</h3>
          </div>
          {state === "completed" && completedAt && (
            <span className="shrink-0 text-xs text-green-700">
              {formatRelativeTime(completedAt)}
            </span>
          )}
          {(state === "completed" || state === "future") && (
            <span className="shrink-0 text-brown-500">
              {showContent ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </span>
          )}
        </button>

        {showContent && (
          <div className="border-t border-cream-100 px-4 pb-4 pt-2">
            {step.description && (
              <div className="mb-4">
                <MarkdownBody content={step.description} />
              </div>
            )}
            {step.image && (
              <button
                type="button"
                onClick={() => setImageOpen(true)}
                className="mb-4 block w-full overflow-hidden rounded-lg"
              >
                <img
                  src={step.image}
                  alt=""
                  className="max-h-72 w-full object-cover transition hover:opacity-95"
                />
              </button>
            )}
            {imageOpen && step.image && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-brown-900/80 p-4"
                onClick={() => setImageOpen(false)}
                role="presentation"
              >
                <img
                  src={step.image}
                  alt=""
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              </div>
            )}
            {step.video_url && (
              <a
                href={step.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 inline-flex items-center gap-2 rounded-lg bg-cream-100 px-4 py-2 text-sm font-medium text-amber-brand-dark hover:bg-cream-200"
              >
                <ExternalLink className="h-4 w-4" />
                Watch video
              </a>
            )}
            {step.tips && (
              <div className="mb-4 rounded-lg border border-amber-brand/20 bg-amber-brand/5">
                <button
                  type="button"
                  onClick={() => setTipsOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-brown-800"
                >
                  Tips & common mistakes
                  {tipsOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                {tipsOpen && (
                  <div className="border-t border-amber-brand/10 px-3 py-2 text-sm text-brown-700">
                    <MarkdownBody content={step.tips} />
                  </div>
                )}
              </div>
            )}
            {completionNotes && (
              <p className="mb-3 rounded-lg bg-cream-50 p-3 text-sm italic text-brown-600">
                Your notes: {completionNotes}
              </p>
            )}
            {canComplete && (
              <div className="mt-4 space-y-3 border-t border-cream-100 pt-4">
                {step.requires_acknowledgement && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-brown-800">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-cream-200 text-amber-brand"
                    />
                    I confirm I understand this step
                  </label>
                )}
                <textarea
                  placeholder="Any questions or feedback about this step? (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-1 focus:ring-amber-brand"
                />
                <Button
                  className="w-full sm:w-auto"
                  disabled={
                    completing ||
                    (step.requires_acknowledgement && !ack)
                  }
                  onClick={() => onComplete?.(ack, notes)}
                >
                  {completing ? "Saving…" : "Mark as Complete"}
                </Button>
              </div>
            )}
            {state === "future" && previewMode && (
              <p className="mt-2 text-xs text-brown-500">Preview only — complete steps in order.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TrainingTimeline() {
  const { programmeId } = useParams<{ programmeId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { locationId, locationRevision } = useLocation();
  const canComplete = usePermission("training.complete");
  const previewMode = searchParams.get("preview") === "1";

  const [programme, setProgramme] = useState<Awaited<
    ReturnType<typeof fetchOrgProgramme>
  > | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [comments, setComments] = useState<TrainingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentStepId, setCommentStepId] = useState<string>("");
  const [postingComment, setPostingComment] = useState(false);

  const load = useCallback(async () => {
    if (!programmeId || !locationId || locationId === ALL_LOCATIONS_ID) return;
    setLoading(true);
    setError(null);
    try {
      const [prog, comm] = await Promise.all([
        fetchOrgProgramme(programmeId),
        fetchTrainingComments(programmeId),
      ]);
      setProgramme(prog);
      setComments(comm);
      try {
        const pr = await fetchTrainingProgress(locationId, programmeId);
        setProgress(pr);
      } catch {
        if (!previewMode && canComplete) {
          await enrolInProgramme(locationId, programmeId);
          const pr = await fetchTrainingProgress(locationId, programmeId);
          setProgress(pr);
        } else {
          setProgress(null);
        }
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [programmeId, locationId, locationRevision, previewMode, canComplete]);

  useEffect(() => {
    load();
  }, [load]);

  const completedOrders = useMemo(() => {
    const set = new Set<number>();
    progress?.completions.forEach((c) => set.add(c.step_order));
    return set;
  }, [progress]);

  const completionByOrder = useMemo(() => {
    const map = new Map<number, { notes: string; completed_at: string }>();
    progress?.completions.forEach((c) => {
      map.set(c.step_order, { notes: c.notes, completed_at: c.completed_at });
    });
    return map;
  }, [progress]);

  const steps = programme?.steps ?? [];
  const isComplete = progress?.enrolment.status === "completed";
  const currentStepNum = progress?.enrolment.current_step ?? 1;
  const completedCount = completedOrders.size;

  async function handleCompleteStep(step: TrainingStep, acknowledged: boolean, notes: string) {
    if (!locationId || !programmeId) return;
    setCompleting(true);
    try {
      await completeTrainingStep(locationId, programmeId, step.id, {
        acknowledged,
        notes,
      });
      await load();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setCompleting(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!programmeId || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      await createTrainingComment(
        programmeId,
        commentBody.trim(),
        commentStepId || null,
      );
      setCommentBody("");
      setCommentStepId("");
      const comm = await fetchTrainingComments(programmeId);
      setComments(comm);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPostingComment(false);
    }
  }

  if (!programmeId) return null;

  if (!locationId || locationId === ALL_LOCATIONS_ID) {
    return <p className="text-brown-600">Select a location to continue training.</p>;
  }

  if (loading) return <p className="text-brown-600">Loading training…</p>;
  if (error && !programme) {
    return <p className="text-red-600">{error}</p>;
  }
  if (!programme) return null;

  const started = progress?.enrolment.started_at;
  const finished = progress?.enrolment.completed_at;
  let durationLabel = "";
  if (started && finished) {
    const ms = new Date(finished).getTime() - new Date(started).getTime();
    const mins = Math.round(ms / 60000);
    durationLabel = mins < 60 ? `${mins} minutes` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/training"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brown-600 hover:text-amber-brand-dark"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </Link>

      <header className="mb-8 rounded-xl border border-cream-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-brown-900">
              {programme.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <CategoryBadge category={programme.category} />
              <span className="text-sm text-brown-600">
                {formatDuration(programme.estimated_duration_minutes)}
              </span>
            </div>
          </div>
        </div>
        {!isComplete && progress && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-brown-700">
              Step {Math.min(currentStepNum, steps.length)} of {steps.length}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-amber-brand transition-all duration-500"
                style={{
                  width: `${steps.length ? (completedCount / steps.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isComplete ? (
        <div className="mb-10 rounded-xl border border-green-200 bg-green-50 p-10 text-center">
          <PartyPopper className="mx-auto h-14 w-14 text-green-600" />
          <h2 className="mt-4 font-display text-2xl font-bold text-green-900">
            Training Complete!
          </h2>
          {durationLabel && (
            <p className="mt-2 text-brown-700">Completed in {durationLabel}</p>
          )}
          {finished && (
            <p className="text-sm text-brown-600">{formatDateTime(finished)}</p>
          )}
          <Button className="mt-6" onClick={() => navigate("/training")}>
            Back to Library
          </Button>
        </div>
      ) : (
        <div className="relative mb-10 pl-2">
          <div
            className="absolute bottom-0 left-[1.35rem] top-0 w-0.5 bg-cream-200"
            aria-hidden
          />
          {steps.map((step) => {
            const state = previewMode
              ? ("future" as StepState)
              : getStepState(step, completedOrders);
            const comp = completionByOrder.get(step.order);
            return (
              <StepTimelineCard
                key={step.id}
                step={step}
                state={state}
                completionNotes={comp?.notes}
                completedAt={comp?.completed_at}
                previewMode={previewMode}
                completing={completing}
                onComplete={(ack, notes) => handleCompleteStep(step, ack, notes)}
              />
            );
          })}
        </div>
      )}

      <section className="rounded-xl border border-cream-200 bg-white p-6">
        <h2 className="font-display text-lg font-bold text-brown-900">
          Questions & Discussion
        </h2>
        <ul className="mt-4 space-y-4">
          {comments.map((c) => {
            const stepRef = c.step
              ? steps.find((s) => s.id === c.step)
              : null;
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.user_name} size="sm" />
                <div>
                  <p className="text-sm font-medium text-brown-900">
                    {c.user_name}
                    <span className="ml-2 font-normal text-brown-500">
                      {formatRelativeTime(c.created_at)}
                    </span>
                  </p>
                  {stepRef && (
                    <p className="text-xs text-amber-brand-dark">
                      Re: Step {stepRef.order} — {stepRef.title}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-brown-800">{c.body}</p>
                </div>
              </li>
            );
          })}
          {comments.length === 0 && (
            <p className="text-sm text-brown-600">No comments yet.</p>
          )}
        </ul>
        {!previewMode && (
          <form onSubmit={handlePostComment} className="mt-6 space-y-3 border-t border-cream-100 pt-4">
            <select
              value={commentStepId}
              onChange={(e) => setCommentStepId(e.target.value)}
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            >
              <option value="">General programme question</option>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  Step {s.order}: {s.title}
                </option>
              ))}
            </select>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment…"
              rows={3}
              required
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-1 focus:ring-amber-brand"
            />
            <Button type="submit" disabled={postingComment}>
              {postingComment ? "Posting…" : "Add Comment"}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
