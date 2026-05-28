import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { fetchMemos, fetchUnreadCount } from "../../api/memos";
import { MemoCard } from "../../components/memos/MemoCard";
import { MemoFilters } from "../../components/memos/MemoFilters";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { hasPermissionAtLocation } from "../../lib/permissions";
import type { MemoFilters as MemoFiltersType, MemoListItem } from "../../types/memo";

export function MemoFeed() {
  const { user } = useAuth();
  const { locationId } = useLocation();
  const [filters, setFilters] = useState<MemoFiltersType>({});
  const [memos, setMemos] = useState<MemoListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    user && locationId
      ? hasPermissionAtLocation(user, locationId, "memos.create")
      : false;

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!locationId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchMemos(locationId, pageNum, filters);
        setMemos((prev) =>
          append ? [...prev, ...data.results] : data.results,
        );
        setHasMore(Boolean(data.next));
        setPage(pageNum);
      } catch {
        setError("Could not load memos.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [locationId, filters],
  );

  useEffect(() => {
    setPage(1);
    loadPage(1, false);
  }, [loadPage]);

  useEffect(() => {
    if (!locationId) return;
    fetchUnreadCount(locationId)
      .then((data) => setUnreadCount(data.count))
      .catch(() => setUnreadCount(0));
  }, [locationId, memos]);

  const pinned = memos.filter((m) => m.is_pinned);
  const regular = memos.filter((m) => !m.is_pinned);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brown-900">Memos</h1>
          {unreadCount > 0 && (
            <p className="mt-2 inline-flex items-center rounded-full bg-amber-brand px-2.5 py-0.5 text-xs font-semibold text-white">
              {unreadCount} unread requiring acknowledgement
            </p>
          )}
        </div>
        {canCreate && (
          <Link to="/memos/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              New Memo
            </Button>
          </Link>
        )}
      </div>

      <MemoFilters filters={filters} onChange={setFilters} />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-center text-sm text-brown-600">Loading memos…</p>
      ) : memos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-200 bg-cream-100/50 py-12 text-center text-brown-600">
          No memos yet.
          {canCreate && (
            <>
              {" "}
              <Link to="/memos/new" className="font-medium text-amber-brand-dark hover:underline">
                Create the first one
              </Link>
            </>
          )}
        </p>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brown-600">
                <span className="h-px flex-1 bg-cream-200" />
                Pinned
                <span className="h-px flex-1 bg-cream-200" />
              </h2>
              <ul className="space-y-3">
                {pinned.map((memo) => (
                  <li key={memo.id}>
                    <MemoCard memo={memo} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {regular.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brown-600">
                  <span className="h-px flex-1 bg-cream-200" />
                  Recent
                  <span className="h-px flex-1 bg-cream-200" />
                </h2>
              )}
              <ul className="space-y-3">
                {regular.map((memo) => (
                  <li key={memo.id}>
                    <MemoCard memo={memo} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasMore && (
            <div className="text-center">
              <Button
                variant="secondary"
                disabled={loadingMore}
                onClick={() => loadPage(page + 1, true)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
