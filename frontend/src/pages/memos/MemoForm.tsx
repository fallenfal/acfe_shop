import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ApiError } from "../../api/client";
import { createMemo, fetchMemo, updateMemo } from "../../api/memos";
import { MarkdownEditor } from "../../components/memos/MarkdownEditor";
import { Button } from "../../components/ui/Button";
import { useLocation } from "../../contexts/LocationContext";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, ROLE_OPTIONS } from "../../lib/memoLabels";
import type { MemoCategory, MemoCreatePayload, MemoPriority } from "../../types/memo";

function toLocalDatetime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

const emptyForm: MemoCreatePayload = {
  title: "",
  body: "",
  priority: "normal",
  category: "general",
  is_pinned: false,
  requires_acknowledgement: false,
  target_roles: [],
  visible_from: null,
  visible_until: null,
};

export function MemoForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { locationId } = useLocation();
  const [form, setForm] = useState<MemoCreatePayload>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleFrom, setVisibleFrom] = useState("");
  const [visibleUntil, setVisibleUntil] = useState("");

  useEffect(() => {
    if (!isEdit || !locationId || !id) return;
    fetchMemo(locationId, id)
      .then((memo) => {
        setForm({
          title: memo.title,
          body: memo.body,
          priority: memo.priority,
          category: memo.category,
          is_pinned: memo.is_pinned,
          requires_acknowledgement: memo.requires_acknowledgement,
          target_roles: memo.target_roles ?? [],
          visible_from: memo.visible_from,
          visible_until: memo.visible_until,
        });
        setVisibleFrom(toLocalDatetime(memo.visible_from));
        setVisibleUntil(toLocalDatetime(memo.visible_until));
      })
      .catch(() => setError("Could not load memo."))
      .finally(() => setLoading(false));
  }, [isEdit, locationId, id]);

  function toggleRole(slug: string) {
    setForm((prev) => {
      const roles = prev.target_roles.includes(slug)
        ? prev.target_roles.filter((r) => r !== slug)
        : [...prev.target_roles, slug];
      return { ...prev, target_roles: roles };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId) return;
    setSubmitting(true);
    setError(null);
    const payload: MemoCreatePayload = {
      ...form,
      visible_from: fromLocalDatetime(visibleFrom),
      visible_until: fromLocalDatetime(visibleUntil),
    };
    try {
      if (isEdit && id) {
        await updateMemo(locationId, id, payload);
        navigate(`/memos/${id}`);
      } else {
        const created = await createMemo(locationId, payload);
        navigate(`/memos/${created.id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save memo. Check your permissions and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-center text-brown-600">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        to={isEdit && id ? `/memos/${id}` : "/memos"}
        className="inline-flex items-center gap-1 text-sm font-medium text-brown-600 hover:text-brown-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Cancel
      </Link>

      <h1 className="font-display text-2xl font-bold text-brown-900">
        {isEdit ? "Edit memo" : "New memo"}
      </h1>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-brown-800">
            Title
          </label>
          <input
            id="title"
            required
            maxLength={300}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-cream-200 px-3 py-2 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-brown-800">Body</span>
          <MarkdownEditor
            value={form.body}
            onChange={(body) => setForm({ ...form, body })}
            placeholder="Write your memo in Markdown…"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-brown-800">Priority</legend>
          <div className="flex flex-wrap gap-4">
            {PRIORITY_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="priority"
                  value={opt.value}
                  checked={form.priority === opt.value}
                  onChange={() =>
                    setForm({ ...form, priority: opt.value as MemoPriority })
                  }
                  className="text-amber-brand focus:ring-amber-brand"
                />
                <span className="text-sm text-brown-800">{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-brown-800">
            Category
          </label>
          <select
            id="category"
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as MemoCategory })
            }
            className="w-full rounded-lg border border-cream-200 px-3 py-2 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
              className="rounded text-amber-brand focus:ring-amber-brand"
            />
            <span className="text-sm text-brown-800">Pin to top of feed</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.requires_acknowledgement}
              onChange={(e) =>
                setForm({ ...form, requires_acknowledgement: e.target.checked })
              }
              className="rounded text-amber-brand focus:ring-amber-brand"
            />
            <span className="text-sm text-brown-800">Requires acknowledgement</span>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-brown-800">
            Target roles <span className="font-normal text-stone-500">(optional)</span>
          </legend>
          <p className="mb-2 text-xs text-stone-500">
            Leave empty to show to all roles at this location.
          </p>
          <div className="flex flex-wrap gap-3">
            {ROLE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-cream-200 px-3 py-2 has-checked:border-amber-brand has-checked:bg-amber-50"
              >
                <input
                  type="checkbox"
                  checked={form.target_roles.includes(opt.value)}
                  onChange={() => toggleRole(opt.value)}
                  className="rounded text-amber-brand focus:ring-amber-brand"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="visible_from" className="mb-1 block text-sm font-medium text-brown-800">
              Visible from <span className="font-normal text-stone-500">(optional)</span>
            </label>
            <input
              id="visible_from"
              type="datetime-local"
              value={visibleFrom}
              onChange={(e) => setVisibleFrom(e.target.value)}
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
            />
          </div>
          <div>
            <label htmlFor="visible_until" className="mb-1 block text-sm font-medium text-brown-800">
              Visible until <span className="font-normal text-stone-500">(optional)</span>
            </label>
            <input
              id="visible_until"
              type="datetime-local"
              value={visibleUntil}
              onChange={(e) => setVisibleUntil(e.target.value)}
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
            />
          </div>
        </div>

        <div className="flex gap-3 border-t border-cream-200 pt-6">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Publish memo"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(isEdit && id ? `/memos/${id}` : "/memos")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
