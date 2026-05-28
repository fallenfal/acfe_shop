import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pin, StickyNote } from "lucide-react";
import { fetchHighlightedMemos } from "../../api/memos";
import { MemoCard } from "./MemoCard";

export function HighlightedMemos({ locationId }: { locationId: string }) {
  const [memos, setMemos] = useState<Awaited<ReturnType<typeof fetchHighlightedMemos>>>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHighlightedMemos(locationId)
      .then((items) => {
        if (!cancelled) setMemos(items);
      })
      .catch(() => {
        if (!cancelled) setMemos([]);
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
      <section className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-brown-600">Loading memos…</p>
      </section>
    );
  }

  if (memos.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-amber-brand-dark" aria-hidden />
          <h2 className="font-display text-lg font-bold text-brown-900">
            Pinned & important memos
          </h2>
        </div>
        <Link
          to="/memos"
          className="text-sm font-medium text-amber-brand-dark hover:underline"
        >
          View all memos
        </Link>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {memos.map((memo) => (
          <li key={memo.id}>
            <MemoCard memo={memo} />
          </li>
        ))}
      </ul>
      {memos.some((m) => m.is_pinned) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-brown-500">
          <Pin className="h-3.5 w-3.5 fill-amber-brand text-amber-brand" aria-hidden />
          Pinned memos stay at the top of the memo feed
        </p>
      )}
    </section>
  );
}
