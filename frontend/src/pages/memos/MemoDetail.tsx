import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  acknowledgeMemo,
  addMemoComment,
  deleteMemo,
  fetchMemo,
} from "../../api/memos";
import { CategoryTag } from "../../components/memos/CategoryTag";
import { MarkdownBody } from "../../components/memos/MarkdownBody";
import { PriorityBadge } from "../../components/memos/PriorityBadge";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { formatDateTime, formatRelativeTime } from "../../lib/format";
import { canEditMemo, isCmOrAbove } from "../../lib/permissions";
import type { MemoDetail as MemoDetailType } from "../../types/memo";

export function MemoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locationId } = useLocation();
  const [memo, setMemo] = useState<MemoDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    if (!locationId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemo(locationId, id);
      setMemo(data);
    } catch {
      setError("Memo not found.");
    } finally {
      setLoading(false);
    }
  }, [locationId, id]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit =
    user && locationId && memo
      ? canEditMemo(user, locationId, memo.author)
      : false;
  const canDelete =
    user && locationId
      ? isCmOrAbove(
          user.locations.find((l) => l.id === locationId)?.role,
        )
      : false;

  const ackTotal =
    memo
      ? memo.acknowledged_users.length + memo.pending_users.length
      : 0;

  async function handleAcknowledge() {
    if (!locationId || !id) return;
    setAcking(true);
    try {
      await acknowledgeMemo(locationId, id);
      await load();
    } finally {
      setAcking(false);
    }
  }

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!locationId || !id || !commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await addMemoComment(locationId, id, commentBody.trim());
      setCommentBody("");
      await load();
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDelete() {
    if (!locationId || !id || !memo) return;
    const hard = window.confirm(
      "Delete permanently? Choose Cancel on the next prompt to hide from the feed instead.",
    );
    if (
      !window.confirm(
        hard
          ? "This cannot be undone. Delete permanently?"
          : "Hide this memo from the feed?",
      )
    ) {
      return;
    }
    try {
      await deleteMemo(locationId, id, hard);
      navigate("/memos");
    } catch {
      setError("Could not delete memo.");
    }
  }

  if (loading) {
    return <p className="text-center text-brown-600">Loading…</p>;
  }

  if (error || !memo) {
    return (
      <div className="text-center">
        <p className="text-red-700">{error ?? "Not found"}</p>
        <Link to="/memos" className="mt-4 inline-block text-amber-brand-dark hover:underline">
          Back to feed
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/memos"
          className="inline-flex items-center gap-1 text-sm font-medium text-brown-600 hover:text-brown-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Link>
        <div className="flex gap-2">
          {canEdit && (
            <Link to={`/memos/${memo.id}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={memo.priority} />
          <CategoryTag category={memo.category} />
          {memo.is_pinned && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              Pinned
            </span>
          )}
        </div>
        <h1 className="font-display text-3xl font-bold text-brown-900">
          {memo.title}
        </h1>
        <div className="flex items-center gap-3">
          <Avatar name={memo.author_name} size="lg" />
          <div>
            <p className="font-medium text-brown-800">{memo.author_name}</p>
            <p className="text-sm text-brown-600">
              <time dateTime={memo.created_at}>
                {formatDateTime(memo.created_at)}
              </time>
              {memo.updated_at !== memo.created_at && (
                <span className="ml-2 text-stone-500">
                  · updated {formatRelativeTime(memo.updated_at)}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      <MarkdownBody content={memo.body} />

      {memo.requires_acknowledgement && !memo.is_read && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="mb-3 text-sm text-brown-800">
            Please confirm you have read and understood this memo.
          </p>
          <Button onClick={handleAcknowledge} disabled={acking}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {acking ? "Saving…" : "Acknowledge"}
          </Button>
        </div>
      )}

      {(memo.requires_acknowledgement || ackTotal > 0) && (
        <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold text-brown-900">
            Acknowledgements
          </h2>
          <p className="mt-1 text-sm text-brown-600">
            {memo.acknowledgement_count}
            {ackTotal > 0 ? ` of ${ackTotal}` : ""} read
          </p>
          {ackTotal > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-amber-brand"
                style={{
                  width: `${Math.round((memo.acknowledgement_count / ackTotal) * 100)}%`,
                }}
              />
            </div>
          )}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brown-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                Read ({memo.acknowledged_users.length})
              </h3>
              <ul className="space-y-2">
                {memo.acknowledged_users.length === 0 ? (
                  <li className="text-sm text-stone-500">No one yet</li>
                ) : (
                  memo.acknowledged_users.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium text-brown-800">{u.name}</span>
                      {u.acknowledged_at && (
                        <time
                          className="text-xs text-stone-500"
                          dateTime={u.acknowledged_at}
                        >
                          {formatRelativeTime(u.acknowledged_at)}
                        </time>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brown-800">
                <Circle className="h-4 w-4 text-stone-400" aria-hidden />
                Pending ({memo.pending_users.length})
              </h3>
              <ul className="space-y-2">
                {memo.pending_users.length === 0 ? (
                  <li className="text-sm text-stone-500">Everyone has read</li>
                ) : (
                  memo.pending_users.map((u) => (
                    <li key={u.id} className="text-sm font-medium text-brown-800">
                      {u.name}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-cream-200 bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-bold text-brown-900">
          Comments ({memo.comment_count})
        </h2>
        <ul className="mt-4 space-y-4">
          {memo.comments.length === 0 ? (
            <li className="text-sm text-stone-500">No comments yet.</li>
          ) : (
            memo.comments.map((c) => (
              <li
                key={c.id}
                className="border-b border-cream-100 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <Avatar name={c.user_name} size="sm" />
                  <div>
                    <span className="text-sm font-medium text-brown-800">
                      {c.user_name}
                    </span>
                    <time
                      className="ml-2 text-xs text-stone-500"
                      dateTime={c.created_at}
                    >
                      {formatRelativeTime(c.created_at)}
                    </time>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-brown-700">
                  {c.body}
                </p>
              </li>
            ))
          )}
        </ul>
        <form onSubmit={handleComment} className="mt-6 space-y-3">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
          />
          <Button type="submit" disabled={submittingComment || !commentBody.trim()}>
            {submittingComment ? "Posting…" : "Post comment"}
          </Button>
        </form>
      </section>
    </article>
  );
}
